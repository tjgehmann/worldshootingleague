import { useEffect, useState } from 'react';

import { getOutbox, subscribeToOutbox, type OutboxEntry } from './outbox';

/** Live view of the queue, for banners and per-bout state. */
export function useOutbox(): {
  entries: OutboxEntry[];
  pending: OutboxEntry[];
  rejected: OutboxEntry[];
  /** Bout ids with something waiting, so a bout can show "queued". */
  queuedBoutIds: Set<string>;
  /** Open series ids with a report still on the phone. */
  queuedSeriesIds: Set<string>;
} {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);

  useEffect(() => {
    getOutbox().then(setEntries);
    return subscribeToOutbox(setEntries);
  }, []);

  return {
    entries,
    pending: entries.filter((e) => e.state === 'pending'),
    rejected: entries.filter((e) => e.state === 'rejected'),
    queuedBoutIds: new Set(
      entries.filter((e) => e.kind === 'bout').map((e) => e.boutId),
    ),
    queuedSeriesIds: new Set(
      entries.filter((e) => e.kind === 'series').map((e) => e.seriesId),
    ),
  };
}
