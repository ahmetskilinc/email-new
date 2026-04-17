import { eq } from "drizzle-orm"
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

type GmailThread = {
  id: string
  historyId: string | null
  $raw?: unknown
}

const INITIAL_BACKFILL_PAGES = 3
const PAGE_SIZE = 50

/**
 * Loads a connection row and upserts a sync_state row. Step so it's retried
 * independently and not replayed as part of the workflow body.
 */
async function loadConnectionStep(connectionId: string) {
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

  return conn
}

async function claimSyncLockStep(connectionId: string, runId: string) {
  "use step"
  const { db } = createDb(env.DATABASE_URL)
  const now = new Date()
  const staleCutoff = new Date(now.getTime() - 10 * 60 * 1000)

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
  return true
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
): Promise<{
  threads: GmailThread[]
  nextPageToken: string | null
  historyId: string | null
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
    maxResults: PAGE_SIZE,
    pageToken: pageToken ?? undefined,
  })

  const threads = (result.threads ?? []) as GmailThread[]
  const topHistoryId = threads[0]?.historyId ?? null
  return {
    threads,
    nextPageToken: result.nextPageToken ?? null,
    historyId: topHistoryId,
  }
}

async function upsertThreadsStep(
  connectionId: string,
  threads: GmailThread[],
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
    return {
      thread: {
        id: `${connectionId}:${t.id}`,
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
        threadId: `${connectionId}:${t.id}`,
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
) {
  "use step"
  if (!historyId) return
  const { db } = createDb(env.DATABASE_URL)
  await db
    .update(syncState)
    .set({
      historyId,
      lastFullSyncAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(syncState.connectionId, connectionId))
}

/**
 * Initial backfill — first N pages of the inbox, durable per-page.
 * Later phases: replace with Gmail users.history.list delta sync and
 * self-reschedule via sleep() for recurring runs.
 */
export async function syncConnection(input: {
  connectionId: string
  runId?: string
}) {
  "use workflow"
  const { connectionId } = input
  const runId = input.runId ?? crypto.randomUUID()

  await loadConnectionStep(connectionId)
  await claimSyncLockStep(connectionId, runId)

  let totalUpserted = 0
  let pageToken: string | null = null
  let latestHistoryId: string | null = null

  try {
    for (let page = 0; page < INITIAL_BACKFILL_PAGES; page++) {
      const result = await fetchPageStep(connectionId, pageToken)
      if (result.threads.length === 0) break
      latestHistoryId = result.historyId ?? latestHistoryId
      totalUpserted += await upsertThreadsStep(connectionId, result.threads)
      if (!result.nextPageToken) break
      pageToken = result.nextPageToken
    }

    await persistHistoryIdStep(connectionId, latestHistoryId)
    await releaseSyncLockStep(connectionId)
    return { connectionId, runId, upserted: totalUpserted, historyId: latestHistoryId }
  } catch (err) {
    await releaseSyncLockStep(connectionId, {
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}
