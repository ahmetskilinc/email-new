import { and, desc, eq, lt } from "drizzle-orm"
import { emailThread, syncState } from "../db/schema"
import { createDb } from "../db"
import { env } from "../env"

export type StoredThreadListItem = {
  id: string
  historyId: string | null
  $raw: {
    sender: { name?: string | null; email: string }
    subject: string
    receivedOn: string
    unread: boolean
    starred: boolean
  }
}

/**
 * Returns a page of threads for a connection from the local sync store, in
 * the shape `driver.list({ folder: "inbox" })` returns — so callers can swap
 * between provider and local reads without touching downstream code. Cursor
 * is the `lastMessageAt` ISO timestamp of the last row from the prior page.
 */
export async function listThreadsFromStore(params: {
  connectionId: string
  folder?: string
  maxResults: number
  cursor: string | null
}): Promise<{
  threads: StoredThreadListItem[]
  nextPageToken: string | null
}> {
  const { connectionId, folder = "inbox", maxResults, cursor } = params
  if (folder !== "inbox") return { threads: [], nextPageToken: null }

  const { db } = createDb(env.DATABASE_URL)
  const cursorDate = cursor ? new Date(cursor) : null

  const rows = await db.query.emailThread.findMany({
    where: cursorDate
      ? and(
          eq(emailThread.connectionId, connectionId),
          lt(emailThread.lastMessageAt, cursorDate)
        )
      : eq(emailThread.connectionId, connectionId),
    orderBy: [desc(emailThread.lastMessageAt)],
    limit: maxResults + 1,
  })

  const hasMore = rows.length > maxResults
  const page = rows.slice(0, maxResults)

  const threads = page.map<StoredThreadListItem>((t) => {
    const firstParticipant = t.participants?.[0]
    return {
      id: t.providerThreadId,
      historyId: t.historyId ?? null,
      $raw: {
        sender: firstParticipant
          ? { name: firstParticipant.name, email: firstParticipant.email }
          : { email: "unknown" },
        subject: t.subject ?? "(no subject)",
        receivedOn: t.lastMessageAt ? t.lastMessageAt.toISOString() : "",
        unread: t.hasUnread,
        starred: false,
      },
    }
  })

  const last = page.at(-1)
  const nextPageToken =
    hasMore && last?.lastMessageAt ? last.lastMessageAt.toISOString() : null

  return { threads, nextPageToken }
}

/**
 * True when the store has been primed for this connection and the caller
 * should prefer local reads. Set via `EMAIL_SYNC_READ_FROM_DB` env flag to
 * opt in globally; individual connections still need a completed first sync.
 */
export async function storeIsReady(connectionId: string): Promise<boolean> {
  if (process.env.EMAIL_SYNC_READ_FROM_DB !== "true") return false
  const { db } = createDb(env.DATABASE_URL)
  const state = await db.query.syncState.findFirst({
    where: eq(syncState.connectionId, connectionId),
    columns: { historyId: true, lastFullSyncAt: true },
  })
  return Boolean(state?.lastFullSyncAt)
}
