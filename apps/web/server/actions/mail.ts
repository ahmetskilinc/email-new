"use server"

import {
  requireSession,
  requireActiveDriver,
} from "../lib/session"
import { getzeitmailDB, connectionToDriver } from "../lib/server-utils"
import { processEmailHtml } from "../lib/email-processor"
import { defaultPageSize, FOLDERS } from "../lib/utils"
import { toAttachmentFiles } from "../lib/attachments"
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

  allThreads.sort((a, b) => {
    const rawA = a.$raw as Record<string, unknown> | undefined
    const rawB = b.$raw as Record<string, unknown> | undefined
    const dateA = rawA?.receivedOn
      ? new Date(rawA.receivedOn as string).getTime()
      : 0
    const dateB = rawB?.receivedOn
      ? new Date(rawB.receivedOn as string).getTime()
      : 0
    return dateB - dateA
  })

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
  const { driver } = await requireActiveDriver()

  if (folder === FOLDERS.DRAFT) {
    return driver.listDrafts({ q, maxResults, pageToken: cursor })
  }

  return driver.list({
    folder,
    query: q || undefined,
    maxResults,
    labelIds,
    pageToken: cursor || undefined,
  })
}

export async function markAsRead(ids: string[]) {
  const { driver } = await requireActiveDriver()
  return driver.markAsRead(ids)
}

export async function markAsUnread(ids: string[]) {
  const { driver } = await requireActiveDriver()
  return driver.markAsUnread(ids)
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
}) {
  const { driver } = await requireActiveDriver()
  const { draftId, attachments = [], ...mail } = input

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
