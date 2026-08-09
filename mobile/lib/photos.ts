import { File } from 'expo-file-system';

import { supabase, TARGET_PHOTOS_BUCKET } from './supabase';

/**
 * Uploading the proof of an open series.
 *
 * A season report goes through lib/outbox.ts, because its window is a week and
 * a range has no reception. An open series cannot: its window is 45 minutes, so
 * a report that waits for a signal would arrive after the window shut and be
 * refused — correctly. The upload therefore happens now or not at all, and the
 * screen says so rather than pretending otherwise.
 *
 * The path is <open_series_id>/<shooter_id>/…, which the storage policy accepts
 * only while that series is declared and unreported.
 */
export async function uploadSeriesPhoto(
  seriesId: string,
  shooterId: string,
  sourceUri: string,
): Promise<string> {
  const path = `${seriesId}/${shooterId}/target-${Date.now()}.jpg`;
  const bytes = await new File(sourceUri).bytes();

  const { error } = await supabase.storage
    .from(TARGET_PHOTOS_BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });

  if (error) throw error;
  return path;
}
