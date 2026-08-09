/**
 * Runs a task over every item, never more than `limit` at once.
 *
 * The Projects list needs one `details` request per managed project and there is
 * no aggregate endpoint. `Promise.all` over the whole list would open as many
 * connections as the person happens to manage — forty projects, forty
 * simultaneous requests — which is a load pattern the backend never agreed to
 * and which gets worse precisely for the busiest users.
 *
 * Enriching only the first few rows instead would be quieter but dishonest: the
 * rest of the list would report unknown staffing forever. So every row is
 * attempted, a few at a time.
 *
 * Results keep the input order regardless of which task finishes first, so a
 * caller can zip them back onto the items by index. The task is expected to
 * return a value rather than reject; one rejection here would abandon the rest.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  // Each worker pulls the next index until the list is exhausted, so a slow
  // task delays only its own worker rather than a whole batch.
  async function work(): Promise<void> {
    for (let index = next++; index < items.length; index = next++) {
      results[index] = await task(items[index]!);
    }
  }

  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, work));

  return results;
}
