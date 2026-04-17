import { eq } from "drizzle-orm"
import { start } from "workflow/api"
import { sleep } from "workflow"
import { createDb } from "../db"
import {
  connection as connectionTable,
  emailMessage,
  emailThread,
  syncState,
} from "../db/schema"
import { connectionToDriver } from "../lib/server-utils"
import { normalizeThreadPreview } from "@/lib/thread-utils"
import { env } from "../env"

type ProviderThread = {
  id: string
  historyId: string | null
  $raw?: unknown
}

const INITIAL_BACKFILL_PAGES = 3
const PAGE_SIZE = 50
const DELTA_PAGE_SIZE = 50
const SYNC_INTERVAL = "5m"
const STALE_LOCK_MS = 10 * 60 * 1000

async function loadSyncStateStep(connectionId: string): Promise<{
  historyId: string | null
}> {
  "use step"
  const { db } = createDb(env.DATABASE_URL)
  const conn = await db.query.connection.findFirst({
    where: eq(connectionTable.id, connectionId),
  })
  if (!conn) throw new Error(`Connection ${connectionId} not found`)

  await db
    .insert(syncState)
    .values({ connectionId, updatedAt: new Date() })
    .onConflictDoNothing({ target: syncState.connectionId })

  const state = await db.query.syncState.findFirst({
    where: eq(syncState.connectionId, connectionId),
  })
  return { historyId: state?.historyId ?? null }
}

async function claimSyncLockStep(connectionId: string, runId: string) {
  "use step"
  const { db } = createDb(env.DATABASE_URL)
  const now = new Date()
  const staleCutoff = new Date(now.getTime() - STALE_LOCK_MS)

  const rows = await db
    .update(syncState)
    .set({ syncLockedAt: now, lastRunId: runId, updatedAt: now })
    .where(eq(syncState.connectionId, connectionId))
    .returning({ previousLock: syncState.syncLockedAt })

  const previous = rows[0]?.previousLock
  if (previous && previous > staleCutoff) {
    throw new Error(
      `Sync lock held since ${previous.toISOString()} for ${connectionId}`,
    )
  }
}

async function releaseSyncLockStep(
  connectionId: string,
  result: { error?: string } = {},
) {
  "use step"
  const { db } = createDb(env.DATABASE_URL)
  await db
    .update(syncState)
    .set({
      syncLockedAt: null,
      lastDeltaAt: new Date(),
      lastError: result.error ?? null,
      updatedAt: new Date(),
    })
    .where(eq(syncState.connectionId, connectionId))
}

async function fetchPageStep(
  connectionId: string,
  pageToken: string | null,
  maxResults = PAGE_SIZE,
): Promise<{
  threads: ProviderThread[]
  nextPageToken: string | null
  topHistoryId: string | null
}> {
  "use step"
  const { db } = createDb(env.DATABASE_URL)
  const conn = await db.query.connection.findFirst({
    where: eq(connectionTable.id, connectionId),
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
  historyId: string,
): Promise<{
  supported: boolean
  changedThreadIds: string[]
  nextHistoryId: string | null
}> {
  "use step"
  const { db } = createDb(env.DATABASE_URL)
  const conn = await db.query.connection.findFirst({
    where: eq(connectionTable.id, connectionId),
  })
  if (!conn) throw new Error(`Connection ${connectionId} not found`)
  if (conn.providerId !== "google") {
    return { supported: false, changedThreadIds: [], nextHistoryId: null }
  }

  const driver = connectionToDriver(conn)
  const { history, historyId: nextHistoryId } = await driver.listHistory<{
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
    changedThreadIds: [...ids],
    nextHistoryId: nextHistoryId ?? null,
  }
}

async function upsertThreadsStep(
  connectionId: string,
  threads: ProviderThread[],
): Promise<number> {
  "use step"
  if (threads.length === 0) return 0
  const { db } = createDb(env.DATABASE_URL)
  const now = new Date()

  const rows = threads.map((t) => {
    const preview = normalizeThreadPreview(t.$raw)
    const sender = preview.sender
    const receivedAt = preview.receivedOn
      ? new Date(preview.receivedOn)
      : now
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
    for (const r of rows) {
      await tx
        .insert(emailThread)
        .values(r.thread)
        .onConflictDoUpdate({
          target: [emailThread.connectionId, emailThread.providerThreadId],
          set: {
            subject: r.thread.subject,
            snippet: r.thread.snippet,
            participants: r.thread.participants,
            hasUnread: r.thread.hasUnread,
            lastMessageAt: r.thread.lastMessageAt,
            historyId: r.thread.historyId,
            syncedAt: r.thread.syncedAt,
            updatedAt: r.thread.updatedAt,
          },
        })
      await tx
        .insert(emailMessage)
        .values(r.message)
        .onConflictDoUpdate({
          target: [emailMessage.connectionId, emailMessage.providerMessageId],
          set: {
            snippet: r.message.snippet,
            flags: r.message.flags,
            syncedAt: r.message.syncedAt,
          },
        })
    }
  })

  return rows.length
}

async function persistHistoryIdStep(
  connectionId: string,
  historyId: string | null,
  markFullSync = false,
) {
  "use step"
  if (!historyId) return
  const { db } = createDb(env.DATABASE_URL)
  const patch: {
    historyId: string
    updatedAt: Date
    lastFullSyncAt?: Date
  } = { historyId, updatedAt: new Date() }
  if (markFullSync) patch.lastFullSyncAt = new Date()
  await db
    .update(syncState)
    .set(patch)
    .where(eq(syncState.connectionId, connectionId))
}

async function connectionExistsStep(connectionId: string): Promise<boolean> {
  "use step"
  const { db } = createDb(env.DATABASE_URL)
  const row = await db.query.connection.findFirst({
    where: eq(connectionTable.id, connectionId),
    columns: { id: true },
  })
  return Boolean(row)
}

/**
 * Single sync cycle. Not a workflow on its own — orchestrates durable steps
 * so both the one-shot `syncConnection` workflow and the looping
 * `scheduleSyncConnection` workflow can share the same logic.
 */
async function runSyncCycle(connectionId: string, runId: string) {
  const { historyId } = await loadSyncStateStep(connectionId)
  await claimSyncLockStep(connectionId, runId)

  let upserted = 0
  let latestHistoryId: string | null = historyId
  let mode: "backfill" | "delta" | "refresh" = "backfill"

  try {
    if (!historyId) {
      let pageToken: string | null = null
      for (let page = 0; page < INITIAL_BACKFILL_PAGES; page++) {
        const result = await fetchPageStep(connectionId, pageToken)
        if (result.threads.length === 0) break
        latestHistoryId = result.topHistoryId ?? latestHistoryId
        upserted += await upsertThreadsStep(connectionId, result.threads)
        if (!result.nextPageToken) break
        pageToken = result.nextPageToken
      }
      await persistHistoryIdStep(connectionId, latestHistoryId, true)
    } else {
      const delta = await fetchHistoryDeltaStep(connectionId, historyId)
      if (delta.supported) {
        mode = "delta"
        if (delta.changedThreadIds.length > 0) {
          const page = await fetchPageStep(
            connectionId,
            null,
            DELTA_PAGE_SIZE,
          )
          latestHistoryId = page.topHistoryId ?? delta.nextHistoryId
          upserted = await upsertThreadsStep(connectionId, page.threads)
        } else {
          latestHistoryId = delta.nextHistoryId ?? historyId
        }
        await persistHistoryIdStep(connectionId, latestHistoryId)
      } else {
        mode = "refresh"
        const page = await fetchPageStep(connectionId, null, DELTA_PAGE_SIZE)
        latestHistoryId = page.topHistoryId ?? historyId
        upserted = await upsertThreadsStep(connectionId, page.threads)
        await persistHistoryIdStep(connectionId, latestHistoryId)
      }
    }

    await releaseSyncLockStep(connectionId)
    return { mode, upserted, historyId: latestHistoryId }
  } catch (err) {
    await releaseSyncLockStep(connectionId, {
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
  runId?: string
}) {
  "use workflow"
  const runId = input.runId ?? crypto.randomUUID()
  const result = await runSyncCycle(input.connectionId, runId)
  return { connectionId: input.connectionId, runId, ...result }
}

/**
 * Long-running scheduler: one sync cycle, sleep SYNC_INTERVAL, then restart
 * itself so the loop survives deploys and crashes. Start once per connection
 * (at signup / first login); exits when the connection is removed.
 */
export async function scheduleSyncConnection(input: { connectionId: string }) {
  "use workflow"
  const { connectionId } = input

  const exists = await connectionExistsStep(connectionId)
  if (!exists) return { connectionId, status: "ended" as const }

  await runSyncCycle(connectionId, crypto.randomUUID())
  await sleep(SYNC_INTERVAL)

  await start(scheduleSyncConnection, [{ connectionId }])
  return { connectionId, status: "rescheduled" as const }
}
