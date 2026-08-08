/**
 * Deciding what a failed submission means.
 *
 * Kept apart from outbox.ts, which imports native modules, so this can be
 * exercised with plain Node — see outbox-errors.test.ts.
 *
 * Getting these wrong is expensive in both directions. Treat a validation
 * failure as transport and the queue retries a doomed report forever; treat a
 * dropped connection as permanent and a shooter loses a series they shot.
 */

/**
 * A failure that will pass on its own: no connection, a timeout, a socket that
 * died. Anything else is the server saying no, and retrying will not change it.
 */
export function isTransportFailure(error: unknown): boolean {
  if (!error) return false;

  const name = (error as { name?: string }).name ?? '';
  if (name === 'AbortError' || name === 'TypeError') return true;

  const message = String((error as { message?: string }).message ?? error).toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('aborted') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('load failed')
  );
}

/** Unique violation: the row is already there, so an earlier attempt landed. */
export function isDuplicateSubmission(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}
