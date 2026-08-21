"use server"

import { requireSession, requireActiveDriver } from "../lib/session"
import { getzeitmailDB, connectionToDriver } from "../lib/server-utils"
import { extractThreadDate, normalizeThreadPreview } from "@/lib/thread-utils"
import { processEmailHtml } from "../lib/email-processor"
import { safeError } from "../lib/safe-error"
import { logSecurityEvent } from "../lib/audit"
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_RECIPIENTS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  LimitExceededError,
  assertBulkIds,
  clampPageSize,
  mapWithConcurrency,
} from "../lib/limits"
import { getListUnsubscribeAction } from "../lib/email-utils"
import { assertPublicHost } from "../lib/transport/host-validation"
import { defaultPageSize, FOLDERS } from "../lib/utils"
import { toAttachmentFiles } from "../lib/attachments"
import { listThreadsFromStore, storeIsReady } from "../lib/email-store"
import type { DeleteAllSpamResponse } from "../types"
import type { Sender } from "../types"

export async function getThread(id: string, connectionId?: string) {
  const { session, connection, driver } = await requireActiveDriver()
  let activeDriver = driver

  if (connectionId && connectionId !== connection.id) {
    const db = await getzeitmailDB(session.user.id)
    const specificConn = await db.findUserConnection(connectionId)
    if (!specificConn) {
      throw new Error("Connection not found or access denied")
    }
    activeDriver = connectionToDriver(specificConn)
  }

  return activeDriver.get(id)
}

export async function listAllInboxes(
  maxResults: number = defaultPageSize,
  cursor: string = ""
) {
  const session = await requireSession()
  maxResults = clampPageSize(maxResults, defaultPageSize)
  const db = await getzeitmailDB(session.user.id)
  const connections = await db.findManyConnections()
  const cursors: Record<string, string> = cursor ? JSON.parse(cursor) : {}

  const results = await Promise.allSettled(
    connections
      .filter((c) => c.accessToken)
      .map(async (conn) => {
        const driver = connectionToDriver(conn)
        const result = await driver.list({
          folder: "inbox",
          maxResults,
          pageToken: cursors[conn.id] || undefined,
        })
        return { connectionId: conn.id, ...result }
      })
  )

  const allThreads = results
    .filter(
      (
        r
      ): r is PromiseFulfilledResult<{
        connectionId: string
        threads: { id: string; historyId: string | null; $raw?: unknown }[]
        nextPageToken: string | null
      }> => r.status === "fulfilled"
    )
    .flatMap((r) =>
      r.value.threads.map((t) => ({
        ...t,
        connectionId: r.value.connectionId,
      }))
    )

  allThreads.sort(
    (a, b) => extractThreadDate(b.$raw) - extractThreadDate(a.$raw)
  )

  const nextCursors: Record<string, string> = {}
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.nextPageToken) {
      nextCursors[r.value.connectionId] = r.value.nextPageToken
    }
  }

  const nextPageToken =
    Object.keys(nextCursors).length > 0 ? JSON.stringify(nextCursors) : null
  return { threads: allThreads, nextPageToken }
}

export async function listThreads(
  folder: string = "inbox",
  q: string = "",
  maxResults: number = defaultPageSize,
  cursor: string = "",
  labelIds: string[] = []
) {
  const { connection, driver } = await requireActiveDriver()
  maxResults = clampPageSize(maxResults, defaultPageSize)

  if (folder === FOLDERS.DRAFT) {
    return driver.listDrafts({ q, maxResults, pageToken: cursor })
  }

  // Prefer the local sync store for plain inbox browsing once the first
  // sync has completed. Searches and non-inbox folders still hit the
  // provider until those paths are covered by the sync agent.
  if (folder === "inbox" && !q && labelIds.length === 0) {
    if (await storeIsReady(connection.id)) {
      return listThreadsFromStore({
        connectionId: connection.id,
        folder,
        maxResults,
        cursor: cursor || null,
      })
    }
  }

  return driver.list({
    folder,
    query: q || undefined,
    maxResults,
    labelIds,
    pageToken: cursor || undefined,
  })
}

export async function searchMail(params: {
  q: string
  from?: string
  after?: string
  before?: string
  hasAttachment?: boolean
  folder?: string
  maxResults?: number
  cursor?: string
}) {
  const { driver } = await requireActiveDriver()

  let query = params.q || ""
  if (params.from) {
    const fromValue = params.from.includes(" ")
      ? `"${params.from}"`
      : params.from
    query += ` from:${fromValue}`
  }
  if (params.after) query += ` after:${params.after}`
  if (params.before) query += ` before:${params.before}`
  if (params.hasAttachment) query += ` has:attachment`

  const folder = params.folder || "inbox"
  return driver.list({
    folder,
    query: query.trim() || undefined,
    maxResults: clampPageSize(params.maxResults, defaultPageSize),
    pageToken: params.cursor || undefined,
  })
}

export async function markAsRead(ids: string[], connectionId?: string) {
  const { session, connection, driver } = await requireActiveDriver()
  let activeDriver = driver

  if (connectionId && connectionId !== connection.id) {
    const db = await getzeitmailDB(session.user.id)
    const specificConn = await db.findUserConnection(connectionId)
    if (!specificConn) {
      throw new Error("Connection not found or access denied")
    }
    activeDriver = connectionToDriver(specificConn)
  }

  return activeDriver.markAsRead(assertBulkIds(ids, "messages"))
}

export async function markAsUnread(ids: string[], connectionId?: string) {
  const { session, connection, driver } = await requireActiveDriver()
  let activeDriver = driver

  if (connectionId && connectionId !== connection.id) {
    const db = await getzeitmailDB(session.user.id)
    const specificConn = await db.findUserConnection(connectionId)
    if (!specificConn) {
      throw new Error("Connection not found or access denied")
    }
    activeDriver = connectionToDriver(specificConn)
  }

  return activeDriver.markAsUnread(assertBulkIds(ids, "messages"))
}

export async function modifyLabels(
  threadId: string[],
  addLabels: string[] = [],
  removeLabels: string[] = []
) {
  const { driver } = await requireActiveDriver()
  const safeIds = assertBulkIds(threadId, "threads")
  if (!safeIds.length)
    return { success: false, error: "No thread IDs provided" }
  await driver.modifyLabels(safeIds, { addLabels, removeLabels })
  return { success: true }
}

export async function toggleStar(ids: string[], starred?: boolean) {
  const { driver } = await requireActiveDriver()
  const safeIds = assertBulkIds(ids, "threads")
  if (!safeIds.length) return { success: false }

  // When the caller already knows the desired state, skip the per-id reads
  // entirely. Callers that don't pass it keep the old read-then-toggle
  // behavior.
  let shouldStar: boolean
  if (typeof starred === "boolean") {
    shouldStar = starred
  } else {
    // Bounded: this used to issue one provider round-trip per id, unbounded and
    // fully concurrent, from a caller-supplied array.
    const threads = await mapWithConcurrency(safeIds, 5, (id) => driver.get(id))
    const anyStarred = threads.some(
      (r) =>
        r.status === "fulfilled" &&
        r.value.messages.some((m) =>
          m.tags?.some((t) => t.name.toLowerCase().startsWith("starred"))
        )
    )
    shouldStar = !anyStarred
  }

  await driver.modifyLabels(safeIds, {
    addLabels: shouldStar ? ["STARRED"] : [],
    removeLabels: shouldStar ? [] : ["STARRED"],
  })
  return { success: true }
}

export async function toggleImportant(ids: string[], important?: boolean) {
  const { driver } = await requireActiveDriver()
  const safeIds = assertBulkIds(ids, "threads")
  if (!safeIds.length) return { success: false }

  // Same shape as toggleStar: an explicit desired state avoids the reads.
  let shouldMark: boolean
  if (typeof important === "boolean") {
    shouldMark = important
  } else {
    const threads = await mapWithConcurrency(safeIds, 5, (id) => driver.get(id))
    const anyImportant = threads.some(
      (r) =>
        r.status === "fulfilled" &&
        r.value.messages.some((m) =>
          m.tags?.some((t) => t.name.toLowerCase().startsWith("important"))
        )
    )
    shouldMark = !anyImportant
  }

  await driver.modifyLabels(safeIds, {
    addLabels: shouldMark ? ["IMPORTANT"] : [],
    removeLabels: shouldMark ? [] : ["IMPORTANT"],
  })
  return { success: true }
}

export async function bulkStar(ids: string[]) {
  const { driver } = await requireActiveDriver()
  ids = assertBulkIds(ids, "threads")
  return driver.modifyLabels(ids, { addLabels: ["STARRED"], removeLabels: [] })
}

export async function bulkUnstar(ids: string[]) {
  const { driver } = await requireActiveDriver()
  ids = assertBulkIds(ids, "threads")
  return driver.modifyLabels(ids, { addLabels: [], removeLabels: ["STARRED"] })
}

export async function bulkMarkImportant(ids: string[]) {
  const { driver } = await requireActiveDriver()
  ids = assertBulkIds(ids, "threads")
  return driver.modifyLabels(ids, {
    addLabels: ["IMPORTANT"],
    removeLabels: [],
  })
}

export async function bulkUnmarkImportant(ids: string[]) {
  const { driver } = await requireActiveDriver()
  ids = assertBulkIds(ids, "threads")
  return driver.modifyLabels(ids, {
    addLabels: [],
    removeLabels: ["IMPORTANT"],
  })
}

export async function bulkDelete(ids: string[]) {
  const { driver } = await requireActiveDriver()
  ids = assertBulkIds(ids, "threads")
  return driver.modifyLabels(ids, { addLabels: ["TRASH"], removeLabels: [] })
}

export async function bulkArchive(ids: string[]) {
  const { driver } = await requireActiveDriver()
  ids = assertBulkIds(ids, "threads")
  return driver.modifyLabels(ids, { addLabels: [], removeLabels: ["INBOX"] })
}

export async function bulkMute(ids: string[]) {
  const { driver } = await requireActiveDriver()
  ids = assertBulkIds(ids, "threads")
  return driver.modifyLabels(ids, { addLabels: ["MUTE"], removeLabels: [] })
}

export async function deleteAllSpam(): Promise<DeleteAllSpamResponse> {
  try {
    const { driver } = await requireActiveDriver()
    return await driver.deleteAllSpam()
  } catch (error) {
    return {
      success: false,
      message: "Failed to delete spam emails",
      error: safeError("deleteAllSpam", error).message,
      count: 0,
    }
  }
}

// Per-user send throttle. better-auth's rateLimit table only backs its own
// auth endpoints (no reusable helper is exposed for arbitrary server actions),
// so this is a minimal in-memory sliding window instead: per-process, resets
// on deploy, which is acceptable for a soft abuse ceiling on outbound mail.
const SEND_WINDOW_MS = 10 * 60 * 1000
const SEND_MAX_PER_WINDOW = 30
const sendTimestampsByUser = new Map<string, number[]>()

function assertSendAllowed(userId: string) {
  const now = Date.now()
  const recent = (sendTimestampsByUser.get(userId) ?? []).filter(
    (t) => now - t < SEND_WINDOW_MS
  )
  if (recent.length >= SEND_MAX_PER_WINDOW) {
    throw new LimitExceededError(
      "Sending limit reached. Please wait a few minutes and try again."
    )
  }
  recent.push(now)
  sendTimestampsByUser.set(userId, recent)
}

// Deliberately loose: providers are the authority on deliverability, this only
// rejects values that cannot be an address at all (and anything embedding
// whitespace or CR/LF, which could smuggle extra headers).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function assertValidRecipients(recipients: Sender[]) {
  for (const r of recipients) {
    if (typeof r?.email !== "string" || !EMAIL_PATTERN.test(r.email)) {
      throw new Error("One or more recipient email addresses are invalid.")
    }
  }
}

// Client-supplied headers pass straight through to the drivers, so only the
// threading headers a reply legitimately needs survive; everything else
// (From, Bcc, Content-Type, transport-relevant headers, …) is dropped.
const ALLOWED_CLIENT_HEADERS = new Set(["in-reply-to", "references"])

function sanitizeClientHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!headers) return undefined
  const filtered: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (
      ALLOWED_CLIENT_HEADERS.has(key.toLowerCase()) &&
      typeof value === "string"
    ) {
      filtered[key] = value.replace(/[\r\n]/g, "")
    }
  }
  return filtered
}

export async function sendMail(input: {
  to: Sender[]
  subject: string
  message: string
  attachments?: {
    name: string
    type: string
    size: number
    lastModified: number
    base64: string
  }[]
  headers?: Record<string, string>
  cc?: Sender[]
  bcc?: Sender[]
  threadId?: string
  fromEmail?: string
  draftId?: string
  isForward?: boolean
  originalMessage?: string
  signatureId?: string
}) {
  const { session, connection, driver } = await requireActiveDriver()
  const { draftId, attachments = [], signatureId, ...mail } = input

  assertSendAllowed(session.user.id)

  assertValidRecipients([
    ...(input.to ?? []),
    ...(input.cc ?? []),
    ...(input.bcc ?? []),
  ])

  mail.headers = sanitizeClientHeaders(mail.headers)
  // CR/LF in the subject would let a caller inject additional headers into the
  // outgoing message.
  mail.subject = (mail.subject ?? "").replace(/[\r\n]/g, " ")

  // Unbounded recipients and attachments meant one call could fan out to
  // arbitrarily many addresses and queue an upsert per recipient against the
  // shared pool. A stolen session should not become unlimited mass-send from
  // the victim's real domain.
  const recipientCount =
    (input.to?.length ?? 0) + (input.cc?.length ?? 0) + (input.bcc?.length ?? 0)
  if (recipientCount > MAX_RECIPIENTS) {
    throw new LimitExceededError(
      `Too many recipients (max ${MAX_RECIPIENTS} per message).`
    )
  }
  if (attachments.length > MAX_ATTACHMENTS) {
    throw new LimitExceededError(
      `Too many attachments (max ${MAX_ATTACHMENTS}).`
    )
  }
  let totalAttachmentBytes = 0
  for (const att of attachments) {
    const size = Number(att?.size ?? 0)
    if (size > MAX_ATTACHMENT_BYTES) {
      throw new LimitExceededError("Attachment exceeds the size limit.")
    }
    totalAttachmentBytes += size
  }
  if (totalAttachmentBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new LimitExceededError("Attachments exceed the total size limit.")
  }

  const db = await getzeitmailDB(session.user.id)
  let signatureBody: string | null = null
  if (signatureId) {
    const sig = await db.findSignature(signatureId)
    if (sig) signatureBody = sig.body
  } else {
    const defaultSig = await db.findDefaultSignature(connection.id)
    if (defaultSig) signatureBody = defaultSig.body
  }
  if (signatureBody) {
    mail.message = `${mail.message}<div><br>--<br>${signatureBody}</div>`
  }

  const processedAttachments = attachments.map((att: any) =>
    typeof att?.arrayBuffer === "function" ? att : toAttachmentFiles([att])[0]
  )

  const outgoing = {
    ...mail,
    attachments: processedAttachments,
  } as any

  let messageId: string | null = null
  if (draftId) {
    await driver.sendDraft(draftId, outgoing)
  } else {
    const created = await driver.create(outgoing)
    messageId = created?.id ?? null
  }

  // Track recipients for autocomplete
  const allRecipients = [
    ...(input.to ?? []),
    ...(input.cc ?? []),
    ...(input.bcc ?? []),
  ]
  await Promise.allSettled(
    allRecipients.map((r) => db.upsertRecipient(r.email, r.name))
  )

  await logSecurityEvent("mail_sent", session.user.id, {
    connectionId: connection.id,
    recipientCount,
    attachmentCount: attachments.length,
  })

  return { success: true, messageId }
}

export async function deleteThread(id: string) {
  const { driver } = await requireActiveDriver()
  await driver.delete(id)
  return true
}

export async function snoozeThreads(ids: string[]) {
  ids = assertBulkIds(ids, "threads")
  if (!ids.length) return { success: false, error: "No thread IDs provided" }
  const { driver } = await requireActiveDriver()
  await driver.modifyLabels(ids, {
    addLabels: ["SNOOZED"],
    removeLabels: ["INBOX"],
  })
  return { success: true }
}

export async function unsnoozeThreads(ids: string[]) {
  ids = assertBulkIds(ids, "threads")
  if (!ids.length) return { success: false, error: "No thread IDs" }
  const { driver } = await requireActiveDriver()
  await driver.modifyLabels(ids, {
    addLabels: ["INBOX"],
    removeLabels: ["SNOOZED"],
  })
  return { success: true }
}

export async function getMessageAttachments(messageId: string) {
  const { driver } = await requireActiveDriver()
  return driver.getMessageAttachments(messageId)
}

export async function getEmailAliases() {
  const { driver } = await requireActiveDriver()
  return driver.getEmailAliases()
}

export async function processEmailContent(
  html: string,
  shouldLoadImages: boolean,
  theme: "light" | "dark"
) {
  await requireSession()
  try {
    const { processedHtml, hasBlockedImages } = processEmailHtml({
      html,
      shouldLoadImages,
      theme,
    })
    return { processedHtml, hasBlockedImages }
  } catch (error) {
    console.error("Error processing email content:", error)
    throw new Error("Failed to process email content")
  }
}

export async function getRawEmail(id: string) {
  const { driver } = await requireActiveDriver()
  return driver.getRawEmail(id)
}

export type PollNewMessage = {
  id: string
  from: string
  subject: string
  isUnread: boolean
}

export async function pollNewMessages(cursor: string | null): Promise<{
  cursor: string | null
  newMessages: PollNewMessage[]
}> {
  const { driver } = await requireActiveDriver()

  const result = await driver.list({
    folder: "inbox",
    maxResults: 20,
  })

  const threads = result.threads ?? []
  if (threads.length === 0) {
    return { cursor, newMessages: [] }
  }

  // Prime the pump on first call — don't notify for anything that already existed.
  if (!cursor) {
    return { cursor: threads[0]?.id ?? null, newMessages: [] }
  }

  const cursorIndex = threads.findIndex((t) => t.id === cursor)
  const fresh = cursorIndex === -1 ? threads : threads.slice(0, cursorIndex)

  const newMessages: PollNewMessage[] = fresh.map((t) => {
    const preview = normalizeThreadPreview(t.$raw)
    const fromName = preview.sender.name?.trim()
    return {
      id: t.id,
      from: fromName && fromName.length > 0 ? fromName : preview.sender.email,
      subject: preview.subject,
      isUnread: preview.unread,
    }
  })

  return {
    cursor: threads[0]?.id ?? cursor,
    newMessages,
  }
}

export async function unsubscribeFromList(input: {
  listUnsubscribe: string
  listUnsubscribePost?: string
}) {
  await requireSession()
  const action = getListUnsubscribeAction(input)
  if (!action) throw new Error("No unsubscribe action available")

  if (action.type === "get" || action.type === "post") {
    // The unsubscribe URL comes straight out of an email header, so it is
    // attacker-controlled. assertPublicHost resolves the hostname and rejects
    // loopback/private/link-local/CGNAT ranges, IP literals, and hostnames
    // that resolve to internal addresses — the hand-rolled prefix blocklist
    // this replaces missed most of those. Redirects are followed manually so
    // every hop's host gets the same check; a public host must not be able to
    // bounce the request onto the internal network.
    const MAX_REDIRECTS = 3
    let url = new URL(action.url)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Invalid unsubscribe URL")
    }
    await assertPublicHost(url.hostname, "Unsubscribe")

    let res: Response
    for (let hop = 0; ; hop++) {
      res = await fetch(url, {
        method: action.type === "post" ? "POST" : "GET",
        headers:
          action.type === "post"
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : undefined,
        body: action.type === "post" ? action.body : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      })

      if (res.status < 300 || res.status >= 400) break

      const location = res.headers.get("location")
      if (!location) break
      if (hop >= MAX_REDIRECTS) {
        throw new Error("Unsubscribe request failed (too many redirects)")
      }
      url = new URL(location, url)
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("Invalid unsubscribe URL")
      }
      await assertPublicHost(url.hostname, "Unsubscribe")
    }

    if (!res.ok) {
      throw new Error(`Unsubscribe request failed (${res.status})`)
    }

    return { type: "success" as const }
  }

  return {
    type: "email" as const,
    email: action.emailAddress,
    subject: action.subject,
  }
}
