import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set. Copy .env.example to .env.',
  );
}

/**
 * Requests give up rather than hang.
 *
 * A range hall is a concrete box with poor reception; a socket that never
 * answers would otherwise leave the screen spinning indefinitely. Failing after
 * ten seconds lets the UI say so and offer a retry.
 */
const REQUEST_TIMEOUT_MS = 10_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // Respect a caller's own signal as well as the timeout.
  init?.signal?.addEventListener('abort', () => controller.abort(), { once: true });

  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

export const supabase = createClient(url, anonKey, {
  global: { fetch: fetchWithTimeout },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No deep-link callback in this build; sessions come from password sign-in.
    detectSessionInUrl: false,
  },
});

export const TARGET_PHOTOS_BUCKET = 'target-photos';

/**
 * Storage layout the RLS policies expect: <bout_id>/<shooter_id>/<file>.
 * Getting this wrong means the upload is rejected, not silently misfiled.
 */
export function targetPhotoPath(boutId: string, shooterId: string): string {
  return `${boutId}/${shooterId}/target-${Date.now()}.jpg`;
}
