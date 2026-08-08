import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';

import { isDuplicateSubmission, isTransportFailure } from './outbox-errors';
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
 */

const STORAGE_KEY = 'wsl.outbox.v1';
const OUTBOX_DIR = 'outbox';
/** Beyond this a pending entry has almost certainly hit something permanent. */
const MAX_ATTEMPTS = 20;

export interface OutboxEntry {
  id: string;
  boutId: string;
  matchId: string;
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

type Listener = (entries: OutboxEntry[]) => void;
const listeners = new Set<Listener>();
let cache: OutboxEntry[] | null = null;

async function read(): Promise<OutboxEntry[]> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  cache = raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
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

export interface QueueInput {
  boutId: string;
  matchId: string;
  shooterId: string;
  total: number;
  innerTens: number | null;
  /** The picker's file, still in a cache the system may clear. */
  sourceUri: string;
  fromCamera: boolean;
  shotAt: Date;
}

export async function queueSubmission(input: QueueInput): Promise<OutboxEntry> {
  const id = `${input.boutId}-${Date.now()}`;
  const target = new File(outboxDirectory(), `${id}.jpg`);

  // Out of the picker's cache and into storage we control.
  await new File(input.sourceUri).copy(target);

  const entry: OutboxEntry = {
    id,
    boutId: input.boutId,
    matchId: input.matchId,
    shooterId: input.shooterId,
    total: input.total,
    innerTens: input.innerTens,
    photoUri: target.uri,
    fromCamera: input.fromCamera,
    shotAt: input.shotAt.toISOString(),
    queuedAt: new Date().toISOString(),
    attempts: 0,
    state: 'pending',
  };

  await write([...(await read()), entry]);
  return entry;
}

async function discard(entry: OutboxEntry): Promise<void> {
  try {
    const file = new File(entry.photoUri);
    if (file.exists) file.delete();
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
  const file = new File(entry.photoUri);
  if (!file.exists) {
    throw Object.assign(new Error('The photo for this report is gone.'), { code: 'no_photo' });
  }

  const path = targetPhotoPath(entry.boutId, entry.shooterId);
  const bytes = await file.bytes();

  const { error: uploadError } = await supabase.storage
    .from(TARGET_PHOTOS_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

  if (uploadError) throw uploadError;

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
