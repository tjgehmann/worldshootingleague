import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';
import { Platform } from 'react-native';

import { isDuplicateSubmission, isTransportFailure } from './outbox-errors';
import { reportOpenSeries } from './queries';
import { supabase, TARGET_PHOTOS_BUCKET, targetPhotoPath } from './supabase';

/**
 * Reporting a result without reception.
 *
 * A range is usually a concrete box in a basement, so the moment a shooter is
 * most likely to submit is the moment they are least likely to have a
 * connection. Everything therefore goes through this queue: submitting writes a
 * local entry and then tries to send it. Online that takes a second and the
 * entry disappears; offline it waits, and the app says so.
 *
 * Two things make the delay safe rather than merely tolerable:
 *
 *   * The photo is copied out of the picker's cache into the app's own storage,
 *     so it survives the system reclaiming space, an app restart, or a reboot.
 *   * `shot_at` is the moment the series was actually fired, not the moment it
 *     reached the server. Without that a queued entry would claim to have been
 *     shot hours later, and the database's window check would be measuring the
 *     wrong thing.
 *
 * Two kinds go through it. A season report belongs to a bout and has a week to
 * arrive. An open series has two hours from the moment it was declared — and
 * that deadline is the server's, not this queue's: waiting is allowed, arriving
 * late is not. The queue gives up on its own when the window has passed rather
 * than uploading a photograph the server is about to refuse.
 */

const STORAGE_KEY = 'wsl.outbox.v1';
const OUTBOX_DIR = 'outbox';
/** Beyond this a pending entry has almost certainly hit something permanent. */
const MAX_ATTEMPTS = 20;

interface BaseEntry {
  id: string;
  shooterId: string;
  total: number;
  innerTens: number | null;
  /** A file inside the app's document directory, not the picker's cache. */
  photoUri: string;
  fromCamera: boolean;
  /** When the series was fired. */
  shotAt: string;
  queuedAt: string;
  attempts: number;
  lastError?: string;
  /** 'pending' is waiting for a connection; 'rejected' needs the shooter. */
  state: 'pending' | 'rejected';
}

/** A series of a season match: it belongs to a bout and has a week. */
export interface BoutEntry extends BaseEntry {
  kind: 'bout';
  boutId: string;
  matchId: string;
}

/** A series shot with no opponent: two hours from declaring, then it is gone. */
export interface SeriesEntry extends BaseEntry {
  kind: 'series';
  seriesId: string;
  /** The server's deadline, copied here so the queue can stop trying. */
  reportBy: string;
}

export type OutboxEntry = BoutEntry | SeriesEntry;

type Listener = (entries: OutboxEntry[]) => void;
const listeners = new Set<Listener>();
let cache: OutboxEntry[] | null = null;

async function read(): Promise<OutboxEntry[]> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  // Entries written before open series existed have no kind; they are all
  // season reports.
  cache = raw
    ? (JSON.parse(raw) as OutboxEntry[]).map(
        (e) => ({ ...e, kind: e.kind ?? 'bout' }) as OutboxEntry,
      )
    : [];
  return cache;
}

async function write(entries: OutboxEntry[]): Promise<void> {
  cache = entries;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  listeners.forEach((l) => l(entries));
}

export function subscribeToOutbox(listener: Listener): () => void {
  listeners.add(listener);
  read().then((entries) => listener(entries));
  return () => listeners.delete(listener);
}

export async function getOutbox(): Promise<OutboxEntry[]> {
  return [...(await read())];
}

function outboxDirectory(): Directory {
  const dir = new Directory(Paths.document, OUTBOX_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

// -------------------------------------------------------- photo storage ----
//
// "Somewhere the system will not reclaim" means different things on the two
// platforms. Native has a real filesystem, so the photo is copied into the
// app's document directory exactly as the comment above the queue describes.
// expo-file-system's File/Directory are native-only, though — `new File()`
// on web throws (`this.validatePath is not a function`), because there is no
// native module behind it to implement path validation at all.
//
// The web build has no filesystem to copy into, but it does not need one:
// the picker already hands back the picked image as a blob: URL, and the
// outbox entry itself is durable the moment AsyncStorage (localStorage on
// web) persists it. So the photo is read into a data: URI once and stored as
// the entry's photoUri directly — self-contained, survives a reload with the
// rest of the entry, and needs nothing deleted when the report is done with.

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the photo'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

/** Copies the picker's file somewhere durable and returns the stored photoUri. */
async function storePhoto(id: string, sourceUri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const blob = await (await fetch(sourceUri)).blob();
    return blobToDataUri(blob);
  }
  const target = new File(outboxDirectory(), `${id}.jpg`);
  await new File(sourceUri).copy(target);
  return target.uri;
}

async function photoExists(photoUri: string): Promise<boolean> {
  if (Platform.OS === 'web') return photoUri.startsWith('data:');
  return new File(photoUri).exists;
}

/** The bytes to upload — a type supabase-js's storage client accepts on both platforms. */
async function readPhotoBytes(photoUri: string): Promise<Blob | Uint8Array> {
  if (Platform.OS === 'web') return await (await fetch(photoUri)).blob();
  return new File(photoUri).bytes();
}

async function deletePhoto(photoUri: string): Promise<void> {
  if (Platform.OS === 'web') return; // A data: URI is just a string in the entry; nothing to delete.
  const file = new File(photoUri);
  if (file.exists) file.delete();
}

interface CommonInput {
  shooterId: string;
  total: number;
  innerTens: number | null;
  /** The picker's file, still in a cache the system may clear. */
  sourceUri: string;
  fromCamera: boolean;
  shotAt: Date;
}

export interface QueueInput extends CommonInput {
  boutId: string;
  matchId: string;
}

export interface QueueSeriesInput extends CommonInput {
  seriesId: string;
  reportBy: Date;
}

/** Copies the photo somewhere the system will not reclaim, and queues the row. */
async function queue(id: string, input: CommonInput, rest: object): Promise<OutboxEntry> {
  // Out of the picker's cache and into storage we control.
  const photoUri = await storePhoto(id, input.sourceUri);

  const entry = {
    id,
    shooterId: input.shooterId,
    total: input.total,
    innerTens: input.innerTens,
    photoUri,
    fromCamera: input.fromCamera,
    shotAt: input.shotAt.toISOString(),
    queuedAt: new Date().toISOString(),
    attempts: 0,
    state: 'pending' as const,
    ...rest,
  } as OutboxEntry;

  await write([...(await read()), entry]);
  return entry;
}

export async function queueSubmission(input: QueueInput): Promise<OutboxEntry> {
  return queue(`${input.boutId}-${Date.now()}`, input, {
    kind: 'bout',
    boutId: input.boutId,
    matchId: input.matchId,
  });
}

export async function queueSeriesReport(input: QueueSeriesInput): Promise<OutboxEntry> {
  return queue(`${input.seriesId}-${Date.now()}`, input, {
    kind: 'series',
    seriesId: input.seriesId,
    reportBy: input.reportBy.toISOString(),
  });
}

async function discard(entry: OutboxEntry): Promise<void> {
  try {
    await deletePhoto(entry.photoUri);
  } catch {
    // A photo we cannot delete is litter, not a failure.
  }
  await write((await read()).filter((e) => e.id !== entry.id));
}

/**
 * Sends one entry. Photo first: both it and the row are checked against
 * can_submit_to_bout(), so a closed bout fails on the upload and never leaves a
 * row pointing at a missing file.
 */
async function send(entry: OutboxEntry): Promise<void> {
  if (!(await photoExists(entry.photoUri))) {
    throw Object.assign(new Error('The photo for this report is gone.'), { code: 'no_photo' });
  }

  // A report that misses the two hours is still sent: the server keeps it as
  // practice rather than throwing the evening away. What it will not take is
  // one from a day ago, so give up here rather than upload a photograph that is
  // about to be refused.
  if (
    entry.kind === 'series' &&
    new Date(entry.reportBy).getTime() < Date.now() - 24 * 60 * 60 * 1000
  ) {
    throw Object.assign(
      new Error('This has been waiting more than a day. It is too late to record.'),
      { code: 'window_closed' },
    );
  }

  const folder = entry.kind === 'bout' ? entry.boutId : entry.seriesId;
  const path = targetPhotoPath(folder, entry.shooterId);
  const bytes = await readPhotoBytes(entry.photoUri);

  const { error: uploadError } = await supabase.storage
    .from(TARGET_PHOTOS_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) throw uploadError;

  if (entry.kind === 'series') {
    await reportOpenSeries({
      id: entry.seriesId,
      total: entry.total,
      innerTens: entry.innerTens,
      photoPath: path,
      shotAt: entry.shotAt,
      fromCamera: entry.fromCamera,
    });
    return;
  }

  const { error } = await supabase.from('submissions').insert({
    bout_id: entry.boutId,
    shooter_id: entry.shooterId,
    total: entry.total,
    inner_tens: entry.innerTens,
    photo_path: path,
    capture_method: entry.fromCamera ? 'in_app_camera' : 'gallery',
    source: 'manual',
    shot_at: entry.shotAt,
  });

  if (error && !isDuplicateSubmission(error)) throw error;
}

export interface FlushResult {
  sent: number;
  waiting: number;
  rejected: number;
}

let flushing: Promise<FlushResult> | null = null;

/** Safe to call often — concurrent calls share one run. */
export async function flushOutbox(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = runFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function runFlush(): Promise<FlushResult> {
  const entries = await read();
  const pending = entries.filter((e) => e.state === 'pending');
  const result: FlushResult = { sent: 0, waiting: 0, rejected: entries.length - pending.length };

  if (pending.length === 0) return result;

  const state = await Network.getNetworkStateAsync().catch(() => null);
  if (state && state.isInternetReachable === false) {
    result.waiting = pending.length;
    return result;
  }

  for (const entry of pending) {
    try {
      await send(entry);
      await discard(entry);
      result.sent += 1;
    } catch (e) {
      const transport = isTransportFailure(e) && entry.attempts + 1 < MAX_ATTEMPTS;
      const current = await read();

      await write(
        current.map((row) =>
          row.id === entry.id
            ? {
                ...row,
                attempts: row.attempts + 1,
                lastError: (e as { message?: string })?.message ?? 'Could not send',
                state: transport ? 'pending' : 'rejected',
              }
            : row,
        ),
      );

      if (transport) {
        result.waiting += 1;
        // No connection means the rest will fail the same way.
        break;
      }
      result.rejected += 1;
    }
  }

  return result;
}

/** Drops an entry the shooter has acknowledged, photo and all. */
export async function dismissEntry(id: string): Promise<void> {
  const entry = (await read()).find((e) => e.id === id);
  if (entry) await discard(entry);
}

/** Retries something that was rejected — after a deadline was extended, say. */
export async function retryEntry(id: string): Promise<void> {
  const entries = await read();
  await write(
    entries.map((e) =>
      e.id === id ? { ...e, state: 'pending', attempts: 0, lastError: undefined } : e,
    ),
  );
  await flushOutbox();
}

/** Flushes whenever the device gets a usable connection back. */
export function watchConnectivity(): () => void {
  const sub = Network.addNetworkStateListener((event) => {
    if (event.isInternetReachable) flushOutbox().catch(() => {});
  });
  return () => sub.remove();
}
