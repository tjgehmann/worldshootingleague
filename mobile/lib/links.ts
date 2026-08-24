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

/**
 * Where a password reset link comes back to.
 *
 * Supabase appends the recovery tokens as a fragment, so this has to be a URL
 * the app is actually served from — an address that merely redirects would drop
 * them, since a fragment never reaches the server.
 */
export function resetRedirectUrl(): string {
  const origin = appOrigin();
  if (origin) return `${origin}/reset`;
  // A native build with no web deployment: the scheme from app.json.
  return 'wsl://reset';
}

/**
 * Where a signup confirmation link comes back to.
 *
 * Left unset, Supabase falls back to the project's Site URL — a dashboard
 * setting, not something a deploy of this repo controls, and easy to leave
 * pointing at wherever it was last tested from (a `npm start` on
 * localhost, say) instead of where the link is actually opened.
 */
export function confirmRedirectUrl(): string {
  const origin = appOrigin();
  if (origin) return `${origin}/`;
  return 'wsl://';
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
