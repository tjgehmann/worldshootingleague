import type { Bout, ScoringMode } from './types';

/** German decimal comma; integer disciplines print without a fraction. */
export function formatScore(value: number | null | undefined, mode: ScoringMode): string {
  if (value === null || value === undefined) return '–';
  return mode === 'integer'
    ? String(Math.round(value))
    : value.toFixed(1).replace('.', ',');
}

export function formatPoints(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

/** "noch 3 Tage", "noch 4 Std.", "abgelaufen" */
export function timeLeft(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'abgelaufen';

  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 48) return `noch ${Math.floor(hours / 24)} Tage`;
  if (hours >= 1) return `noch ${hours} Std.`;
  return `noch ${Math.max(1, Math.floor(ms / 60_000))} Min.`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * What the shooter has to do next in this bout. The client never decides
 * anything — it only renders the state the database already holds.
 */
export type BoutView = 'shoot' | 'waiting' | 'result' | 'closed';

export function boutView(bout: Bout, hasOwnSubmission: boolean): BoutView {
  switch (bout.state) {
    case 'open':
      return 'shoot';
    case 'awaiting_opponent':
      return hasOwnSubmission ? 'waiting' : 'shoot';
    case 'revealed':
    case 'settled':
    case 'disputed':
      return 'result';
    default:
      return 'closed';
  }
}

export function boutLabel(bout: Bout, totalBouts: number): string {
  return totalBouts > 1 ? `Serie ${bout.index}` : 'Serie';
}
