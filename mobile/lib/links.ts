import { Platform } from 'react-native';

/**
 * Links a club official can send round.
 *
 * Recruiting happens in a WhatsApp group, not in an app store, so a season has
 * to be one paste away. Three sources, in order of how good the link is:
 *
 *   1. EXPO_PUBLIC_SITE_URL — where the web app is hosted. Opens the season
 *      page, and there is a button on it.
 *   2. The origin the web build is being served from, which is the same thing
 *      when nobody has set the variable.
 *   3. The public-pages edge function on the Supabase project. Always exists
 *      once the project is deployed, needs no configuration, and renders real
 *      HTML — so it is the one that survives being pasted into a chat that
 *      builds a preview.
 *
 * A native build with no site URL configured falls back to (3), which is right:
 * a link that opens a web page everyone can read beats a deep link that only
 * works for people who already have the app.
 */

const SITE = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/+$/, '');
const SUPABASE = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');

function appOrigin(): string | null {
  if (SITE) return SITE;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return null;
}

/** The server-rendered page, for when there is no app to open. */
function publicPage(path: string): string {
  return SUPABASE ? `${SUPABASE}/functions/v1/public-pages${path}` : path;
}

export function seasonUrl(slug: string): string {
  const origin = appOrigin();
  return origin ? `${origin}/season/${slug}` : publicPage(`/s/${slug}`);
}

export function clubUrl(slug: string): string {
  const origin = appOrigin();
  return origin ? `${origin}/club/${slug}` : publicPage(`/c/${slug}`);
}

export function matchUrl(id: string): string {
  const origin = appOrigin();
  return origin ? `${origin}/match/${id}` : publicPage(`/m/${id}`);
}
