import type { ScoringMode } from './types';

/** Decimal disciplines print one decimal place; integer ones print none. */
export function formatScore(value: number | null | undefined, mode: ScoringMode): string {
  if (value === null || value === undefined) return '–';
  return mode === 'integer' ? String(Math.round(value)) : value.toFixed(1);
}

export function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** "3 days left", "4 hrs left", "closed" */
export function timeLeft(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'closed';

  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return `${Math.floor(hours / 24)} days left`;
  if (hours >= 1) return `${hours} hrs left`;
  return `${Math.max(1, Math.floor(ms / 60_000))} min left`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Old enough to hold an account, from an ISO date the shooter typed.
 *
 * Mirrors public.is_adult() in the database, and exists so somebody too young
 * finds out before they have made an account that cannot be used rather than
 * after. The database is still the one that decides.
 */
export function isAdult(isoDate: string, on = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return false;

  const born = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return false;

  const eighteenth = new Date(born);
  eighteenth.setUTCFullYear(born.getUTCFullYear() + 18);
  return eighteenth <= on;
}
