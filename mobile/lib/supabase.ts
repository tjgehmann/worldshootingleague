import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set. Copy .env.example to .env.',
  );
}

export const supabase = createClient(url, anonKey, {
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
