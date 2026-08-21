import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"
import { start } from "workflow/api"
import { sleep } from "workflow"
import { getSharedDb } from "../db"
import {
  connection as connectionTable,
  emailMessage,
  emailThread,
  syncState,
} from "../db/schema"
import { connectionToDriver } from "../lib/server-utils"
import { normalizeThreadPreview } from "@/lib/thread-utils"

type ProviderThread = {
  id: string
  historyId: string | null
  $raw?: unknown
}

/**
 * Every connection lookup inside these steps is scoped by owner as well as id.
 * The authenticated entry points in server/actions/sync.ts already verify
 * ownership before starting a run, but the workflow runtime resumes steps from
 * persisted arguments, so the steps must not assume the id was ever checked.
 */
const scopedConnection = (connectionId: string, userId: string) =>
  and(eq(connectionTable.id, connectionId), eq(connectionTable.userId, userId))

const BACKFILL_PAGES_PER_CYCLE = 3
const PAGE_SIZE = 50
const DELTA_PAGE_SIZE = 50
/** Above this many changed threads a page refresh is cheaper than N gets. */
const MAX_DELTA_THREAD_FETCH = 25
const UPSERT_CHUNK_SIZE = 200
const SYNC_INTERVAL = "5m"
const STALE_LOCK_MS = 10 * 60 * 1000
/**
 * A scheduler loop heartbeats once per cycle (~SYNC_INTERVAL plus the cycle's
 * own work), so a heartbeat this old means the loop died and a new one may
 * take over.
 */
const SCHEDULER_STALE_MS = 30 * 60 * 1000

async function loadSyncStateStep(
  connectionId: string,
  userId: string
): Promise<{
  historyId: string | null
  backfillPageToken: string | null
  backfillComplete: boolean
  providerId: string
}> {
  "use step"
  const { db } = getSharedDb()
  const conn = await db.query.connection.findFirst({
    where: scopedConnection(connectionId, userId),
  })
  if (!conn) throw new Error(`Connection ${connectionId} not found`)

  await db
    .insert(syncState)
    .values({ connectionId, updatedAt: new Date() })
    .onConflictDoNothing({ target: syncState.connectionId })

  const state = await db.query.syncState.findFirst({
    where: eq(syncState.connectionId, connectionId),
  })
  return {
    historyId: state?.historyId ?? null,
    backfillPageToken: state?.backfillPageToken ?? null,
    backfillComplete: Boolean(state?.lastFullSyncAt),
    providerId: conn.providerId,
  }
}

/**
 * Atomic conditional claim: the UPDATE only matches when the lock is free or
 * stale, so exactly one contender wins and losers see zero affected rows.
 * Returns the runId on success, null when another live run holds the lock.
 */
async function claimSyncLockStep(
  connectionId: string,
  providedRunId?: string
): Promise<string | null> {
  "use step"
  const runId = providedRunId ?? crypto.randomUUID()
  const { db } = getSharedDb()
  const now = new Date()
  const staleCutoff = new Date(now.getTime() - STALE_LOCK_MS)

  const rows = await db
    .update(syncState)
    .set({ syncLockedAt: now, lastRunId: runId, updatedAt: now })
    .where(
      and(
        eq(syncState.connectionId, connectionId),
        or(
          isNull(syncState.syncLockedAt),
          lt(syncState.syncLockedAt, staleCutoff)
        )
      )
    )
    .returning({ connectionId: syncState.connectionId })

  return rows.length > 0 ? runId : null
}

async function releaseSyncLockStep(
  connectionId: string,
  runId: string,
  result: { error?: string } = {}
) {
  "use step"
  const { db } = getSharedDb()
  // Only release our own lock — a stale-lock takeover may have already handed
  // it to a newer run, and that run's lock must not be clobbered.
  await db
    .update(syncState)
    .set({
      syncLockedAt: null,
      lastDeltaAt: new Date(),
      lastError: result.error ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(syncState.connectionId, connectionId),
        eq(syncState.lastRunId, runId)
      )
    )
}

async function fetchPageStep(
  connectionId: string,
  userId: string,
  pageToken: string | null,
  maxResults = PAGE_SIZE
): Promise<{
  threads: ProviderThread[]
  nextPageToken: string | null
  topHistoryId: string | null
}> {
  "use step"
  const { db } = getSharedDb()
  const conn = await db.query.connection.findFirst({
    where: scopedConnection(connectionId, userId),
  })
  if (!conn) throw new Error(`Connection ${connectionId} not found`)

  const driver = connectionToDriver(conn)
  const result = await driver.list({
    folder: "inbox",
    maxResults,
    pageToken: pageToken ?? undefined,
  })

  const threads = (result.threads ?? []) as ProviderThread[]
  return {
    threads,
    nextPageToken: result.nextPageToken ?? null,
    topHistoryId: threads[0]?.historyId ?? null,
  }
}

/**
 * Gmail-specific delta via users.history.list. Returns the unique thread IDs
 * touched since `historyId` plus the new cursor. Non-Gmail providers return
 * `supported: false` so the caller does a page-1 refresh instead.
 */
async function fetchHistoryDeltaStep(
  connectionId: string,
  userId: string,
  historyId: string
): Promise<{
  supported: boolean
  expired: boolean
  changedThreadIds: string[]
  nextHistoryId: string | null
}> {
  "use step"
  const { db } = getSharedDb()
  const conn = await db.query.connection.findFirst({
    where: scopedConnection(connectionId, userId),
  })
  if (!conn) throw new Error(`Connection ${connectionId} not found`)
  if (conn.providerId !== "google") {
    return {
      supported: false,
      expired: false,
      changedThreadIds: [],
      nextHistoryId: null,
    }
  }

  const driver = connectionToDriver(conn)
  const {
    history,
    historyId: nextHistoryId,
    historyExpired,
  } = await driver.listHistory<{
    messagesAdded?: { message?: { threadId?: string } }[]
    messagesDeleted?: { message?: { threadId?: string } }[]
    labelsAdded?: { message?: { threadId?: string } }[]
    labelsRemoved?: { message?: { threadId?: string } }[]
  }>(historyId)

  const ids = new Set<string>()
  for (const h of history) {
    const events = [
      ...(h.messagesAdded ?? []),
      ...(h.messagesDeleted ?? []),
      ...(h.labelsAdded ?? []),
      ...(h.labelsRemoved ?? []),
    ]
    for (const ev of events) {
      const tid = ev.message?.threadId
      if (tid) ids.add(tid)
    }
  }

  return {
    supported: true,
    expired: historyExpired === true,
    changedThreadIds: [...ids],
    nextHistoryId: nextHistoryId ?? null,
  }
}

const isNotFoundError = (err: unknown): boolean => {
  const code = (err as { code?: number | string } | null)?.code
  if (code === 404 || code === "404") return true
  const msg = err instanceof Error ? err.message : String(err)
  return /\b404\b|not.?found/i.test(msg)
}

/**
 * Fetches specific threads (delta results) from the provider. A thread that
 * no longer exists — or no longer carries the INBOX label — comes back in
 * `goneThreadIds` so the caller can evict it from the inbox cache.
 */
async function fetchThreadsByIdStep(
  connectionId: string,
  userId: string,
  threadIds: string[]
): Promise<{ threads: ProviderThread[]; goneThreadIds: string[] }> {
  "use step"
  const { db } = getSharedDb()
  const conn = await db.query.connection.findFirst({
    where: scopedConnection(connectionId, userId),
  })
  if (!conn) throw new Error(`Connection ${connectionId} not found`)

  const driver = connectionToDriver(conn)
  const threads: ProviderThread[] = []
  const goneThreadIds: string[] = []

  for (const tid of threadIds) {
    try {
      const thread = await driver.get(tid)
      const latest = thread.latest ?? thread.messages.at(-1)
      if (!latest) {
        goneThreadIds.push(tid)
        continue
      }
      // The store is an inbox cache: a thread whose labels no longer include
      // INBOX (archived, moved) is evicted rather than upserted.
      const inInbox =
        thread.labels.length === 0 ||
        thread.labels.some((l) => l.id.toUpperCase() === "INBOX")
      if (!inInbox) {
        goneThreadIds.push(tid)
        continue
      }
      threads.push({
        id: tid,
        historyId: null,
        $raw: {
          sender: latest.sender,
          subject: latest.subject,
          receivedOn: latest.receivedOn,
          unread: thread.hasUnread,
          starred: latest.tags.some((t) => t.id.toUpperCase() === "STARRED"),
        },
      })
    } catch (err) {
      // Deleted at the provider. Anything else (auth, rate limit) must NOT be
      // mistaken for a deletion, so rethrow and let the cycle record it.
      if (isNotFoundError(err)) {
        goneThreadIds.push(tid)
        continue
      }
      throw err
    }
  }

  return { threads, goneThreadIds }
}

/** Hard-deletes cached rows for threads gone from the provider's inbox. */
async function deleteThreadsStep(
  connectionId: string,
  providerThreadIds: string[]
): Promise<number> {
  "use step"
  if (providerThreadIds.length === 0) return 0
  const { db } = getSharedDb()
  await db.transaction(async (tx) => {
    await tx
      .delete(emailMessage)
      .where(
        and(
          eq(emailMessage.connectionId, connectionId),
          inArray(emailMessage.providerThreadId, providerThreadIds)
        )
      )
    await tx
      .delete(emailThread)
      .where(
        and(
          eq(emailThread.connectionId, connectionId),
          inArray(emailThread.providerThreadId, providerThreadIds)
        )
      )
  })
  return providerThreadIds.length
}

const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function upsertThreadsStep(
  connectionId: string,
  threads: ProviderThread[]
): Promise<number> {
  "use step"
  if (threads.length === 0) return 0
  const { db } = getSharedDb()
  const now = new Date()

  // Dedupe: a multi-row INSERT ... ON CONFLICT cannot touch the same row
  // twice in one statement.
  const seen = new Set<string>()
  const unique = threads.filter((t) =>
    seen.has(t.id) ? false : (seen.add(t.id), true)
  )

  const rows = unique.map((t) => {
    const preview = normalizeThreadPreview(t.$raw)
    const sender = preview.sender
    const receivedAt = preview.receivedOn ? new Date(preview.receivedOn) : now
    const threadRowId = `${connectionId}:${t.id}`
    return {
      thread: {
        id: threadRowId,
        connectionId,
        providerThreadId: t.id,
        subject: preview.subject ?? null,
        snippet: null as string | null,
        participants: sender?.email
          ? [{ name: sender.name ?? null, email: sender.email }]
          : [],
        labels: [] as string[],
        messageCount: 1,
        hasUnread: Boolean(preview.unread),
        lastMessageAt: receivedAt,
        historyId: t.historyId,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      },
      message: {
        id: `${connectionId}:msg:${t.id}`,
        connectionId,
        threadId: threadRowId,
        providerMessageId: t.id,
        providerThreadId: t.id,
        folder: "inbox",
        fromName: sender?.name ?? null,
        fromEmail: sender?.email ?? null,
        toRecipients: [] as { name?: string | null; email: string }[],
        ccRecipients: [] as { name?: string | null; email: string }[],
        subject: preview.subject ?? null,
        snippet: null as string | null,
        bodyRef: null as string | null,
        labels: [] as string[],
        flags: {
          unread: Boolean(preview.unread),
          starred: Boolean(preview.starred),
        },
        receivedAt,
        headers: {} as Record<string, string>,
        syncedAt: now,
      },
    }
  })

  await db.transaction(async (tx) => {
    for (const batch of chunk(rows, UPSERT_CHUNK_SIZE)) {
      await tx
        .insert(emailThread)
        .values(batch.map((r) => r.thread))
        .onConflictDoUpdate({
          target: [emailThread.connectionId, emailThread.providerThreadId],
          set: {
            subject: sql`excluded.subject`,
            snippet: sql`excluded.snippet`,
            participants: sql`excluded.participants`,
            hasUnread: sql`excluded.has_unread`,
            lastMessageAt: sql`excluded.last_message_at`,
            // Delta fetches carry no per-thread historyId; keep the stored one.
            historyId: sql`coalesce(excluded.history_id, ${emailThread.historyId})`,
            syncedAt: sql`excluded.synced_at`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
      await tx
        .insert(emailMessage)
        .values(batch.map((r) => r.message))
        .onConflictDoUpdate({
          target: [emailMessage.connectionId, emailMessage.providerMessageId],
          set: {
            snippet: sql`excluded.snippet`,
            flags: sql`excluded.flags`,
            syncedAt: sql`excluded.synced_at`,
          },
        })
    }
  })

  return rows.length
}

async function persistHistoryIdStep(
  connectionId: string,
  historyId: string | null
) {
  "use step"
  if (!historyId) return
  const { db } = getSharedDb()
  await db
    .update(syncState)
    .set({ historyId, updatedAt: new Date() })
    .where(eq(syncState.connectionId, connectionId))
}

/**
 * Records where the backfill got to so the next cycle continues instead of
 * restarting. `lastFullSyncAt` is only set once the provider runs out of
 * pages; `historyId` is only passed for Gmail (bootstrap delta cursor).
 */
async function persistBackfillProgressStep(
  connectionId: string,
  progress: { pageToken: string | null; done: boolean; historyId: string | null }
) {
  "use step"
  const { db } = getSharedDb()
  const now = new Date()
  const patch: Partial<typeof syncState.$inferInsert> = {
    backfillPageToken: progress.pageToken,
    updatedAt: now,
  }
  if (progress.done) patch.lastFullSyncAt = now
  if (progress.historyId) patch.historyId = progress.historyId
  await db
    .update(syncState)
    .set(patch)
    .where(eq(syncState.connectionId, connectionId))
}

async function connectionExistsStep(
  connectionId: string,
  userId: string
): Promise<boolean> {
  "use step"
  const { db } = getSharedDb()
  const row = await db.query.connection.findFirst({
    where: scopedConnection(connectionId, userId),
    columns: { id: true },
  })
  return Boolean(row)
}

/**
 * Single sync cycle. Not a workflow on its own — orchestrates durable steps
 * so both the one-shot `syncConnection` workflow and the looping
 * `scheduleSyncConnection` workflow can share the same logic.
 */
async function runSyncCycle(
  connectionId: string,
  userId: string,
  providedRunId?: string
) {
  const state = await loadSyncStateStep(connectionId, userId)
  const runId = await claimSyncLockStep(connectionId, providedRunId)
  if (!runId) {
    // Another live run holds the lock — skip this cycle rather than error.
    return {
      mode: "skipped" as const,
      upserted: 0,
      historyId: state.historyId,
      runId: null,
    }
  }

  const isGmail = state.providerId === "google"
  let upserted = 0
  let latestHistoryId: string | null = state.historyId
  let mode: "backfill" | "delta" | "refresh" = "backfill"

  try {
    if (!state.backfillComplete) {
      // Resumable backfill: a bounded number of pages per cycle, continuing
      // from the persisted watermark until the provider runs out of pages.
      let pageToken: string | null = state.backfillPageToken
      let done = false
      for (let page = 0; page < BACKFILL_PAGES_PER_CYCLE; page++) {
        const result = await fetchPageStep(connectionId, userId, pageToken)
        // Gmail only: the very first page's top thread bootstraps the delta
        // cursor. Other providers never store a (meaningless) historyId.
        if (isGmail && !latestHistoryId) {
          latestHistoryId = result.topHistoryId
        }
        upserted += await upsertThreadsStep(connectionId, result.threads)
        if (!result.nextPageToken) {
          done = true
          break
        }
        pageToken = result.nextPageToken
      }
      await persistBackfillProgressStep(connectionId, {
        pageToken: done ? null : pageToken,
        done,
        historyId: isGmail && !state.historyId ? latestHistoryId : null,
      })
    } else if (isGmail && latestHistoryId) {
      const delta = await fetchHistoryDeltaStep(
        connectionId,
        userId,
        latestHistoryId
      )
      if (delta.expired) {
        // The stored cursor is older than Gmail's history retention (~1 week).
        // Refresh page 1 and re-seed the cursor from it so future cycles can
        // resume history.list instead of throwing forever.
        mode = "refresh"
        const page = await fetchPageStep(connectionId, userId, null, DELTA_PAGE_SIZE)
        upserted = await upsertThreadsStep(connectionId, page.threads)
        if (page.topHistoryId) {
          latestHistoryId = page.topHistoryId
          await persistHistoryIdStep(connectionId, latestHistoryId)
        }
      } else if (delta.supported) {
        mode = "delta"
        if (delta.changedThreadIds.length > 0) {
          if (delta.changedThreadIds.length <= MAX_DELTA_THREAD_FETCH) {
            const fetched = await fetchThreadsByIdStep(
              connectionId,
              userId,
              delta.changedThreadIds
            )
            upserted = await upsertThreadsStep(connectionId, fetched.threads)
            await deleteThreadsStep(connectionId, fetched.goneThreadIds)
          } else {
            // Too many changes to fetch one by one; refresh the first page.
            const page = await fetchPageStep(
              connectionId,
              userId,
              null,
              DELTA_PAGE_SIZE
            )
            upserted = await upsertThreadsStep(connectionId, page.threads)
          }
        }
        // The cursor comes from history.list itself — never from a page's
        // thread historyId, which reflects that thread's last change only.
        latestHistoryId = delta.nextHistoryId ?? latestHistoryId
        await persistHistoryIdStep(connectionId, latestHistoryId)
      } else {
        mode = "refresh"
        const page = await fetchPageStep(
          connectionId,
          userId,
          null,
          DELTA_PAGE_SIZE
        )
        upserted = await upsertThreadsStep(connectionId, page.threads)
      }
    } else {
      mode = "refresh"
      const page = await fetchPageStep(
        connectionId,
        userId,
        null,
        DELTA_PAGE_SIZE
      )
      upserted = await upsertThreadsStep(connectionId, page.threads)
      // Gmail with no delta cursor yet (e.g. empty mailbox at backfill time):
      // bootstrap it so future cycles can use history.list.
      if (isGmail && page.topHistoryId) {
        latestHistoryId = page.topHistoryId
        await persistHistoryIdStep(connectionId, latestHistoryId)
      }
    }

    await releaseSyncLockStep(connectionId, runId)
    return { mode, upserted, historyId: latestHistoryId, runId }
  } catch (err) {
    await releaseSyncLockStep(connectionId, runId, {
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

/**
 * One-shot sync. Trigger manually (e.g. from the "refresh" button) or right
 * after connecting a new account.
 */
export async function syncConnection(input: {
  connectionId: string
  userId: string
  runId?: string
}) {
  "use workflow"
  const result = await runSyncCycle(
    input.connectionId,
    input.userId,
    input.runId
  )
  return { connectionId: input.connectionId, ...result }
}

/**
 * Atomic scheduler-loop ownership. Claims the loop when nobody owns it, the
 * caller already owns it (`providedSchedulerId`), or the current owner's
 * heartbeat has gone stale (its workflow chain died). Returns the scheduler id
 * on success, null when another live loop owns this connection.
 */
async function claimSchedulerStep(
  connectionId: string,
  providedSchedulerId?: string
): Promise<string | null> {
  "use step"
  const schedulerId = providedSchedulerId ?? crypto.randomUUID()
  const { db } = getSharedDb()
  const now = new Date()
  const staleCutoff = new Date(now.getTime() - SCHEDULER_STALE_MS)

  await db
    .insert(syncState)
    .values({ connectionId, updatedAt: now })
    .onConflictDoNothing({ target: syncState.connectionId })

  const ownership = [
    isNull(syncState.schedulerRunId),
    isNull(syncState.schedulerHeartbeatAt),
    lt(syncState.schedulerHeartbeatAt, staleCutoff),
  ]
  if (providedSchedulerId) {
    ownership.push(eq(syncState.schedulerRunId, providedSchedulerId))
  }

  const rows = await db
    .update(syncState)
    .set({
      schedulerRunId: schedulerId,
      schedulerHeartbeatAt: now,
      updatedAt: now,
    })
    .where(and(eq(syncState.connectionId, connectionId), or(...ownership)))
    .returning({ connectionId: syncState.connectionId })

  return rows.length > 0 ? schedulerId : null
}

async function recordSyncErrorStep(connectionId: string, message: string) {
  "use step"
  const { db } = getSharedDb()
  await db
    .update(syncState)
    .set({ lastError: message, updatedAt: new Date() })
    .where(eq(syncState.connectionId, connectionId))
}

async function rescheduleSelfStep(
  connectionId: string,
  userId: string,
  schedulerId: string
): Promise<string> {
  "use step"
  const run = await start(scheduleSyncConnection, [
    { connectionId, userId, schedulerId },
  ])
  return run.runId
}

/**
 * Long-running scheduler: one sync cycle, sleep SYNC_INTERVAL, then restart
 * itself so the loop survives deploys and crashes. Safe to start more than
 * once — ownership is tracked in syncState (schedulerRunId + heartbeat), so a
 * duplicate start exits immediately while the live loop keeps running, and a
 * dead loop's slot is taken over once its heartbeat goes stale. A failed
 * cycle records the error and still sleeps + reschedules instead of killing
 * the loop. Exits when the connection is removed.
 */
export async function scheduleSyncConnection(input: {
  connectionId: string
  userId: string
  schedulerId?: string
}) {
  "use workflow"
  const { connectionId, userId } = input

  const exists = await connectionExistsStep(connectionId, userId)
  if (!exists) return { connectionId, status: "ended" as const }

  const schedulerId = await claimSchedulerStep(connectionId, input.schedulerId)
  if (!schedulerId) return { connectionId, status: "duplicate" as const }

  try {
    await runSyncCycle(connectionId, userId)
  } catch (err) {
    await recordSyncErrorStep(
      connectionId,
      err instanceof Error ? err.message : String(err)
    )
  }

  await sleep(SYNC_INTERVAL)
  await rescheduleSelfStep(connectionId, userId, schedulerId)
  return { connectionId, status: "rescheduled" as const }
}
