"use server"

import {
  requireSession,
  requireActiveDriver,
} from "../lib/session"
import { getzeitmailDB, connectionToDriver } from "../lib/server-utils"
import { extractThreadDate, normalizeThreadPreview } from "@/lib/thread-utils"
import { processEmailHtml } from "../lib/email-processor"
import { getListUnsubscribeAction } from "../lib/email-utils"
import { defaultPageSize, FOLDERS } from "../lib/utils"
import { toAttachmentFiles } from "../lib/attachments"
import { listThreadsFromStore, storeIsReady } from "../lib/email-store"
import type { DeleteAllSpamResponse } from "../types"
import type { Sender } from "../types"

export async function getThread(
  id: string,
  connectionId?: string,
) {
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
  cursor: string = "",
) {
  const session = await requireSession()
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
      }),
  )

  const allThreads = results
    .filter(
      (r): r is PromiseFulfilledResult<{
        connectionId: string
        threads: { id: string; historyId: string | null; $raw?: unknown }[]
        nextPageToken: string | null
      }> => r.status === "fulfilled",
    )
    .flatMap((r) =>
      r.value.threads.map((t) => ({
        ...t,
        connectionId: r.value.connectionId,
      })),
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
  labelIds: string[] = [],
) {
  const { connection, driver } = await requireActiveDriver()

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
    const fromValue = params.from.includes(" ") ? `"${params.from}"` : params.from
    query += ` from:${fromValue}`
  }
  if (params.after) query += ` after:${params.after}`
  if (params.before) query += ` before:${params.before}`
  if (params.hasAttachment) query += ` has:attachment`

  const folder = params.folder || "inbox"
  return driver.list({
    folder,
    query: query.trim() || undefined,
    maxResults: params.maxResults ?? defaultPageSize,
    pageToken: params.cursor || undefined,
  })
}

export async function markAsRead(ids: string[], connectionId?: string) {
  const { session, connection, driver } = await requireActiveDriver()
  let activeDriver = driver

  if (connectionId && connectionId !== connection.id) {
    const db = await getzeitmailDB(session.user.id)
    const specificConn = await db.findUserConnection(connectionId)
    if (specificConn) {
      activeDriver = connectionToDriver(specificConn)
    }
  }

  return activeDriver.markAsRead(ids)
}

export async function markAsUnread(ids: string[], connectionId?: string) {
  const { session, connection, driver } = await requireActiveDriver()
  let activeDriver = driver

  if (connectionId && connectionId !== connection.id) {
    const db = await getzeitmailDB(session.user.id)
    const specificConn = await db.findUserConnection(connectionId)
    if (specificConn) {
      activeDriver = connectionToDriver(specificConn)
    }
  }

  return activeDriver.markAsUnread(ids)
}

export async function modifyLabels(
  threadId: string[],
  addLabels: string[] = [],
  removeLabels: string[] = [],
) {
  const { driver } = await requireActiveDriver()
  if (!threadId.length) return { success: false, error: "No thread IDs provided" }
  await driver.modifyLabels(threadId, { addLabels, removeLabels })
  return { success: true }
}

export async function toggleStar(ids: string[]) {
  const { driver } = await requireActiveDriver()
  if (!ids.length) return { success: false }

  const threads = await Promise.allSettled(ids.map((id) => driver.get(id)))
  const anyStarred = threads.some(
    (r) =>
      r.status === "fulfilled" &&
      r.value.messages.some((m) =>
        m.tags?.some((t) => t.name.toLowerCase().startsWith("starred")),
      ),
  )

  await driver.modifyLabels(ids, {
    addLabels: anyStarred ? [] : ["STARRED"],
    removeLabels: anyStarred ? ["STARRED"] : [],
  })
  return { success: true }
}

export async function toggleImportant(ids: string[]) {
  const { driver } = await requireActiveDriver()
  if (!ids.length) return { success: false }

  const threads = await Promise.allSettled(ids.map((id) => driver.get(id)))
  const anyImportant = threads.some(
    (r) =>
      r.status === "fulfilled" &&
      r.value.messages.some((m) =>
        m.tags?.some((t) => t.name.toLowerCase().startsWith("important")),
      ),
  )

  await driver.modifyLabels(ids, {
    addLabels: anyImportant ? [] : ["IMPORTANT"],
    removeLabels: anyImportant ? ["IMPORTANT"] : [],
  })
  return { success: true }
}

export async function bulkStar(ids: string[]) {
  const { driver } = await requireActiveDriver()
  return driver.modifyLabels(ids, { addLabels: ["STARRED"], removeLabels: [] })
}

export async function bulkUnstar(ids: string[]) {
  const { driver } = await requireActiveDriver()
  return driver.modifyLabels(ids, { addLabels: [], removeLabels: ["STARRED"] })
}

export async function bulkMarkImportant(ids: string[]) {
  const { driver } = await requireActiveDriver()
  return driver.modifyLabels(ids, {
    addLabels: ["IMPORTANT"],
    removeLabels: [],
  })
}

export async function bulkUnmarkImportant(ids: string[]) {
  const { driver } = await requireActiveDriver()
  return driver.modifyLabels(ids, {
    addLabels: [],
    removeLabels: ["IMPORTANT"],
  })
}

export async function bulkDelete(ids: string[]) {
  const { driver } = await requireActiveDriver()
  return driver.modifyLabels(ids, { addLabels: ["TRASH"], removeLabels: [] })
}

export async function bulkArchive(ids: string[]) {
  const { driver } = await requireActiveDriver()
  return driver.modifyLabels(ids, { addLabels: [], removeLabels: ["INBOX"] })
}

export async function bulkMute(ids: string[]) {
  const { driver } = await requireActiveDriver()
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
      error: String(error),
      count: 0,
    }
  }
}

export async function sendMail(input: {
  to: Sender[]
  subject: string
  message: string
  attachments?: { name: string; type: string; size: number; lastModified: number; base64: string }[]
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
    typeof att?.arrayBuffer === "function"
      ? att
      : toAttachmentFiles([att])[0],
  )

  const outgoing = {
    ...mail,
    attachments: processedAttachments,
  } as any

  if (draftId) {
    await driver.sendDraft(draftId, outgoing)
  } else {
    await driver.create(outgoing)
  }

  // Track recipients for autocomplete
  const allRecipients = [
    ...(input.to ?? []),
    ...(input.cc ?? []),
    ...(input.bcc ?? []),
  ]
  await Promise.allSettled(
    allRecipients.map((r) => db.upsertRecipient(r.email, r.name)),
  )

  return { success: true }
}

export async function deleteThread(id: string) {
  const { driver } = await requireActiveDriver()
  await driver.delete(id)
  return true
}

export async function snoozeThreads(ids: string[]) {
  if (!ids.length) return { success: false, error: "No thread IDs provided" }
  const { driver } = await requireActiveDriver()
  await driver.modifyLabels(ids, {
    addLabels: ["SNOOZED"],
    removeLabels: ["INBOX"],
  })
  return { success: true }
}

export async function unsnoozeThreads(ids: string[]) {
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
  theme: "light" | "dark",
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
    const url = new URL(action.url)
    if (!url.protocol.startsWith("http")) {
      throw new Error("Invalid unsubscribe URL")
    }
    // Block requests to private/internal networks
    const hostname = url.hostname.toLowerCase()
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("172.") ||
      hostname === "metadata.google.internal" ||
      hostname === "[::1]" ||
      hostname.endsWith(".local")
    ) {
      throw new Error("Invalid unsubscribe URL")
    }

    const res = await fetch(action.url, {
      method: action.type === "post" ? "POST" : "GET",
      headers:
        action.type === "post"
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : undefined,
      body: action.type === "post" ? action.body : undefined,
      redirect: "follow",
    })

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
