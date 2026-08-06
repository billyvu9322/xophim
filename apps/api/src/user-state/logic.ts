// Pure business-logic functions for the user-state routes.
// Extracted here so they can be unit-tested without Fastify or Postgres.

/**
 * Returns true when the incoming progress update should overwrite the stored
 * row. Only allow overwrite when `incoming` is strictly after `stored` — this
 * prevents a stale client (e.g. mobile after being offline) from rolling back a
 * newer desktop position. Consistent with P2 merge-guest semantics.
 */
export function shouldOverwriteProgress(
  stored: Date | null,
  incoming: Date,
): boolean {
  if (stored === null) return true;
  return incoming.getTime() > stored.getTime();
}

/**
 * Sort an array of objects that have `updated_at: Date` descending (newest
 * first). Returns a new array; does not mutate the input.
 */
export function sortByUpdatedAt<T extends { updated_at: Date }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime());
}
