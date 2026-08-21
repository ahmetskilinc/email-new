import { and, desc, eq, sql, type SQL } from "drizzle-orm"
import { emailThread, syncState } from "../db/schema"
import { getSharedDb } from "../db"

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
 * is `<lastMessageAt ISO>|<row id>` of the last row from the prior page —
 * a composite key, because `lastMessageAt` alone is nullable and non-unique
 * and would skip or repeat rows at page boundaries. Null `lastMessageAt`
 * coalesces to the epoch so those rows sort last and still paginate stably.
 * Plain-ISO cursors from before the composite format still work (timestamp
 * only, no tiebreak).
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

  // Shared pool — a per-call createDb() leaked a connection pool on every
  // thread-list read.
  const { db } = getSharedDb()

  const epoch = new Date(0)
  const sortKey = sql`coalesce(${emailThread.lastMessageAt}, ${epoch})`

  let cursorCond: SQL | null = null
  if (cursor) {
    const sep = cursor.indexOf("|")
    const iso = sep === -1 ? cursor : cursor.slice(0, sep)
    const cursorId = sep === -1 ? null : cursor.slice(sep + 1)
    const cursorDate = new Date(iso)
    if (!Number.isNaN(cursorDate.getTime())) {
      cursorCond = cursorId
        ? sql`(${sortKey} < ${cursorDate} or (${sortKey} = ${cursorDate} and ${emailThread.id} < ${cursorId}))`
        : sql`${sortKey} < ${cursorDate}`
    }
  }

  const rows = await db.query.emailThread.findMany({
    where: cursorCond
      ? and(eq(emailThread.connectionId, connectionId), cursorCond)
      : eq(emailThread.connectionId, connectionId),
    orderBy: [desc(sortKey), desc(emailThread.id)],
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
    hasMore && last
      ? `${(last.lastMessageAt ?? epoch).toISOString()}|${last.id}`
      : null

  return { threads, nextPageToken }
}

/**
 * True when the store has been primed for this connection and the caller
 * should prefer local reads. Set via `EMAIL_SYNC_READ_FROM_DB` env flag to
 * opt in globally; individual connections still need a completed first sync.
 */
export async function storeIsReady(connectionId: string): Promise<boolean> {
  if (process.env.EMAIL_SYNC_READ_FROM_DB !== "true") return false
  const { db } = getSharedDb()
  const state = await db.query.syncState.findFirst({
    where: eq(syncState.connectionId, connectionId),
    columns: { historyId: true, lastFullSyncAt: true },
  })
  return Boolean(state?.lastFullSyncAt)
}
