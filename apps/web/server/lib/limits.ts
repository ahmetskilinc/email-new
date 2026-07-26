/**
 * Bounds on client-supplied sizes.
 *
 * Server actions are public endpoints, so every count and size that arrives
 * from the browser is attacker-chosen. Without ceilings, a single logged-in
 * caller can fan out thousands of concurrent provider requests or queue an
 * unbounded number of database writes against the shared pool.
 */

export const MAX_BULK_IDS = 100
export const MAX_PAGE_SIZE = 100
export const MAX_RECIPIENTS = 100
export const MAX_ATTACHMENTS = 25
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const MAX_TOTAL_ATTACHMENT_BYTES = 40 * 1024 * 1024

export class LimitExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LimitExceededError"
  }
}

/** Clamps a page size into range rather than rejecting, so paging still works. */
export function clampPageSize(value: number | undefined, fallback: number) {
  const n = Number.isFinite(value) ? Number(value) : fallback
  return Math.min(Math.max(Math.trunc(n), 1), MAX_PAGE_SIZE)
}

export function assertBulkIds(ids: unknown, label = "items"): string[] {
  if (!Array.isArray(ids)) {
    throw new LimitExceededError(`Invalid ${label}.`)
  }
  if (ids.length > MAX_BULK_IDS) {
    throw new LimitExceededError(
      `Too many ${label} in one request (max ${MAX_BULK_IDS}).`
    )
  }
  // Empty ids match unrelated messages in some drivers, so drop them here.
  return ids.filter((id): id is string => typeof id === "string" && id !== "")
}

/** Runs `worker` over `items` with at most `limit` in flight at once. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let cursor = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      for (;;) {
        const index = cursor++
        if (index >= items.length) return
        try {
          results[index] = {
            status: "fulfilled",
            value: await worker(items[index] as T, index),
          }
        } catch (reason) {
          results[index] = { status: "rejected", reason }
        }
      }
    })()
  )

  await Promise.all(runners)
  return results
}
