/**
 * The mailws protocol layer: every request body and every response field name
 * this provider depends on lives in this file and nowhere else.
 *
 * IMPORTANT — these payloads are *not* verified against a live account. Apple
 * does not document `mailws`; the endpoints (`/wm/folder`, `/wm/message`) are
 * established, but the exact request fields have to be re-derived from the
 * current iCloud.com frontend. docs/icloud-mailws.md describes the capture
 * procedure. When a capture disagrees with what is below, correct
 * `WM_REQUESTS` here — nothing above this layer knows these names.
 *
 * Response reading is deliberately tolerant (several candidate keys per field,
 * every field optional) so that a cosmetic rename on Apple's side degrades one
 * field rather than breaking the mailbox.
 */
import { WM_ENDPOINTS, MAX_PAGE_SIZE } from "./constants"
import { ICloudProtocolError, ICloudWebServiceError } from "./errors"
import type { ICloudWebServiceClient } from "./client"
import type {
  ICloudAddress,
  ICloudAttachment,
  ICloudFolder,
  ICloudMessageDetail,
  ICloudMessagePage,
  ICloudMessageSummary,
} from "./types"

/** Request bodies, isolated so a protocol capture can correct them in one place. */
export const WM_REQUESTS = {
  listFolders: () => ({
    method: "list",
    includeCounts: true,
  }),
  listMessages: (input: {
    folderGuid: string
    limit: number
    offset: number
    query?: string
  }) => ({
    method: "list",
    folderId: input.folderGuid,
    limit: input.limit,
    offset: input.offset,
    sortBy: "date",
    sortOrder: "desc",
    ...(input.query ? { searchTerm: input.query } : {}),
  }),
  listConversation: (input: { conversationId: string }) => ({
    method: "list",
    conversationId: input.conversationId,
    sortBy: "date",
    sortOrder: "asc",
  }),
  getMessage: (input: { guid: string; folderGuid?: string }) => ({
    method: "get",
    messageId: input.guid,
    ...(input.folderGuid ? { folderId: input.folderGuid } : {}),
    includeBody: true,
    includeHeaders: true,
    includeAttachments: true,
  }),
  getAttachment: (input: { guid: string; attachmentId: string }) => ({
    method: "getAttachment",
    messageId: input.guid,
    attachmentId: input.attachmentId,
  }),
  getRaw: (input: { guid: string }) => ({
    method: "getSource",
    messageId: input.guid,
  }),
  setFlags: (input: {
    guids: string[]
    unread?: boolean
    flagged?: boolean
  }) => ({
    method: "flag",
    messageIds: input.guids,
    ...(input.unread === undefined ? {} : { unread: input.unread }),
    ...(input.flagged === undefined ? {} : { flagged: input.flagged }),
  }),
  moveMessages: (input: { guids: string[]; toFolderGuid: string }) => ({
    method: "move",
    messageIds: input.guids,
    destFolderId: input.toFolderGuid,
  }),
  deleteMessages: (input: { guids: string[] }) => ({
    method: "delete",
    messageIds: input.guids,
  }),
  emptyFolder: (input: { folderGuid: string }) => ({
    method: "empty",
    folderId: input.folderGuid,
  }),
  createFolder: (input: { name: string; parentGuid?: string }) => ({
    method: "create",
    name: input.name,
    ...(input.parentGuid ? { parentId: input.parentGuid } : {}),
  }),
  renameFolder: (input: { guid: string; name: string }) => ({
    method: "rename",
    folderId: input.guid,
    name: input.name,
  }),
  deleteFolder: (input: { guid: string }) => ({
    method: "delete",
    folderId: input.guid,
  }),
} as const

/* ------------------------------- readers -------------------------------- */

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/** First present, non-empty string among `keys`. */
function str(
  source: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  if (!source) return undefined
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value))
      return String(value)
  }
  return undefined
}

function num(
  source: Record<string, unknown> | undefined,
  ...keys: string[]
): number | undefined {
  if (!source) return undefined
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

function bool(
  source: Record<string, unknown> | undefined,
  ...keys: string[]
): boolean | undefined {
  if (!source) return undefined
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "boolean") return value
    if (value === "true") return true
    if (value === "false") return false
    if (typeof value === "number") return value !== 0
  }
  return undefined
}

/**
 * Finds the first array in the payload under any of the candidate keys, looking
 * one level into a `result`/`data` wrapper. mailws responses have historically
 * been both bare and wrapped.
 */
export function readArray(
  payload: unknown,
  keys: string[]
): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord)
  const root = asRecord(payload)
  if (!root) return []
  const candidates = [root, asRecord(root.result), asRecord(root.data)]
  for (const source of candidates) {
    if (!source) continue
    for (const key of keys) {
      const value = source[key]
      if (Array.isArray(value)) return value.filter(isRecord)
    }
  }
  return []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/** Unwraps a single object payload the same way `readArray` unwraps a list. */
export function readObject(
  payload: unknown,
  keys: string[]
): Record<string, unknown> | undefined {
  const root = asRecord(payload)
  if (!root) return undefined
  const candidates = [root, asRecord(root.result), asRecord(root.data)]
  for (const source of candidates) {
    if (!source) continue
    for (const key of keys) {
      const nested = asRecord(source[key])
      if (nested) return nested
    }
  }
  // A `/wm/message` get can answer with the message object at the top level.
  return root
}

/**
 * mailws reports failures inside a 200 body as often as it does by status code.
 * Surfacing them here keeps every operation from having to re-check.
 */
function assertNoPayloadError(payload: unknown, endpoint: string) {
  const root = asRecord(payload)
  if (!root) return
  const error = root.error ?? root.errorMessage ?? root.reason
  if (typeof error === "string" && error.trim()) {
    throw new ICloudWebServiceError(`iCloud mail service error: ${error}`, {
      endpoint,
    })
  }
  const errorRecord = asRecord(root.error)
  const message = str(errorRecord, "message", "reason", "errorMessage")
  if (message) {
    throw new ICloudWebServiceError(`iCloud mail service error: ${message}`, {
      endpoint,
    })
  }
}

const ROLE_HINTS: [ICloudFolder["role"], RegExp][] = [
  ["inbox", /^inbox$/i],
  ["sent", /^sent(\s|_|-)?(messages|mail|items)?$/i],
  ["drafts", /^drafts?$/i],
  ["trash", /^(deleted\s?messages|trash|bin)$/i],
  ["junk", /^(junk|spam|bulk\s?mail)$/i],
  ["archive", /^archive$/i],
]

/** Apple names the well-known folders inconsistently; normalise to one vocabulary. */
export function normalizeFolderRole(
  raw: Record<string, unknown>
): ICloudFolder["role"] {
  const explicit = str(raw, "role", "type", "specialUse", "folderType")
  if (explicit) {
    const cleaned = explicit.replace(/^\\/, "").toLowerCase()
    if (cleaned === "inbox") return "inbox"
    if (cleaned === "sent" || cleaned === "sentmessages") return "sent"
    if (cleaned === "drafts" || cleaned === "draft") return "drafts"
    if (cleaned === "trash" || cleaned === "deleted") return "trash"
    if (cleaned === "junk" || cleaned === "spam") return "junk"
    if (cleaned === "archive") return "archive"
  }
  const name = str(raw, "name", "displayName", "folderName") ?? ""
  for (const [role, pattern] of ROLE_HINTS) {
    if (pattern.test(name)) return role
  }
  return undefined
}

export function readFolder(raw: Record<string, unknown>): ICloudFolder | null {
  const guid = str(raw, "guid", "folderId", "id", "objId")
  if (!guid) return null
  return {
    guid,
    name: str(raw, "name", "displayName", "folderName") ?? guid,
    role: normalizeFolderRole(raw),
    unreadCount: num(raw, "unreadCount", "unseenCount", "numUnread"),
    totalCount: num(raw, "totalCount", "messageCount", "numTotal", "total"),
    parentGuid: str(raw, "parentId", "parentGuid"),
  }
}

function readAddress(value: unknown): ICloudAddress | undefined {
  if (typeof value === "string") {
    const parsed = parseAddressString(value)
    return parsed ?? undefined
  }
  const raw = asRecord(value)
  if (!raw) return undefined
  const email = str(raw, "email", "address", "emailAddress", "addr")
  if (!email) {
    const display = str(raw, "name", "displayName")
    return display ? (parseAddressString(display) ?? undefined) : undefined
  }
  return { name: str(raw, "name", "displayName", "personName"), email }
}

/** Handles both `Name <a@b>` and a bare address. */
export function parseAddressString(value: string): ICloudAddress | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const angled = trimmed.match(/^(.*)<([^>]+)>\s*$/)
  if (angled) {
    const name = angled[1]?.trim().replace(/^"(.*)"$/, "$1")
    const email = angled[2]?.trim()
    if (!email) return null
    return { name: name || undefined, email }
  }
  if (!trimmed.includes("@")) return null
  return { email: trimmed }
}

function readAddressList(value: unknown): ICloudAddress[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map(readAddress)
      .filter((a): a is ICloudAddress => Boolean(a?.email))
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map(parseAddressString)
      .filter((a): a is ICloudAddress => Boolean(a?.email))
  }
  const single = readAddress(value)
  return single?.email ? [single] : []
}

/**
 * Apple has used seconds, milliseconds and ISO strings for message dates in
 * different payloads. Anything unrecognisable falls back to the epoch rather
 * than `Invalid Date`, which would poison sorting downstream.
 */
export function readDate(raw: Record<string, unknown>): string {
  const numeric = num(
    raw,
    "date",
    "dateReceived",
    "receivedDate",
    "sentDate",
    "timestamp"
  )
  if (numeric !== undefined) {
    const ms = numeric > 1e12 ? numeric : numeric * 1000
    const parsed = new Date(ms)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  const text = str(raw, "date", "dateReceived", "receivedDate", "sentDate")
  if (text) {
    const parsed = new Date(text)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return new Date(0).toISOString()
}

function readFlags(raw: Record<string, unknown>) {
  const flags = asRecord(raw.flags) ?? raw
  const seen = bool(flags, "seen", "isSeen", "read", "isRead")
  const unread =
    bool(flags, "unread", "isUnread") ??
    (seen === undefined ? undefined : !seen)
  return {
    unread: unread ?? false,
    flagged:
      bool(flags, "flagged", "isFlagged", "starred", "isStarred") ?? false,
    draft: bool(flags, "draft", "isDraft") ?? false,
  }
}

export function readMessageSummary(
  raw: Record<string, unknown>
): ICloudMessageSummary | null {
  const guid = str(raw, "guid", "messageId", "id", "objId", "uid")
  if (!guid) return null
  const flags = readFlags(raw)
  const headers = asRecord(raw.headers)
  return {
    guid,
    folderGuid: str(raw, "folderId", "folderGuid", "mailboxId"),
    conversationId: str(raw, "conversationId", "threadId", "convId"),
    messageId:
      str(raw, "rfc822MessageId", "internetMessageId") ??
      str(headers, "message-id", "Message-Id", "Message-ID"),
    references: str(headers, "references", "References"),
    inReplyTo: str(headers, "in-reply-to", "In-Reply-To"),
    subject: str(raw, "subject", "title") ?? "(no subject)",
    from: readAddress(raw.from ?? raw.sender ?? raw.fromAddress),
    to: readAddressList(raw.to ?? raw.toAddresses ?? raw.recipients),
    cc: readAddressList(raw.cc ?? raw.ccAddresses),
    bcc: readAddressList(raw.bcc ?? raw.bccAddresses),
    replyTo: readAddress(raw.replyTo ?? raw.replyToAddress)?.email,
    date: readDate(raw),
    unread: flags.unread,
    flagged: flags.flagged,
    draft: flags.draft,
    hasAttachments:
      bool(raw, "hasAttachments", "hasAttachment", "attachmentFlag") ??
      (Array.isArray(raw.attachments)
        ? (raw.attachments as unknown[]).length > 0
        : false),
    snippet: str(raw, "preview", "snippet", "summary", "excerpt"),
    size: num(raw, "size", "messageSize"),
  }
}

function readAttachment(
  raw: Record<string, unknown>,
  index: number
): ICloudAttachment {
  const body = str(raw, "content", "data", "body") ?? ""
  return {
    attachmentId:
      str(raw, "attachmentId", "guid", "id", "partId") ?? String(index),
    filename: str(raw, "name", "filename", "fileName") ?? `attachment-${index}`,
    mimeType:
      str(raw, "mimeType", "contentType", "type") ?? "application/octet-stream",
    size: num(raw, "size", "length") ?? 0,
    body,
    isInline: bool(raw, "isInline", "inline"),
  }
}

export function readMessageDetail(
  payload: unknown
): ICloudMessageDetail | null {
  const raw = readObject(payload, ["message", "mail", "result"])
  if (!raw) return null
  const summary = readMessageSummary(raw)
  if (!summary) return null

  const bodyRecord = asRecord(raw.body) ?? raw
  const headersRecord = asRecord(raw.headers)
  const headers = headersRecord
    ? Object.fromEntries(
        Object.entries(headersRecord)
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => [k.toLowerCase(), v as string])
      )
    : undefined

  return {
    ...summary,
    html: str(bodyRecord, "html", "htmlBody", "bodyHtml", "content"),
    text: str(bodyRecord, "text", "textBody", "bodyText", "plain"),
    attachments: readArray(raw, ["attachments", "parts"]).map(readAttachment),
    listUnsubscribe: headers?.["list-unsubscribe"],
    listUnsubscribePost: headers?.["list-unsubscribe-post"],
    headers,
  }
}

/* ------------------------------ operations ------------------------------ */

export async function listFolders(
  client: ICloudWebServiceClient
): Promise<ICloudFolder[]> {
  const payload = await client.call(
    WM_ENDPOINTS.folder,
    WM_REQUESTS.listFolders()
  )
  assertNoPayloadError(payload, WM_ENDPOINTS.folder)
  const folders = readArray(payload, ["folders", "items", "mailboxes", "list"])
    .map(readFolder)
    .filter((f): f is ICloudFolder => Boolean(f))

  if (folders.length === 0) {
    throw new ICloudProtocolError(
      "iCloud returned no mail folders. The mailws folder payload has probably changed.",
      { endpoint: WM_ENDPOINTS.folder }
    )
  }
  return folders
}

export function encodeCursor(offset: number): string {
  return String(offset)
}

export function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0
  const parsed = Number(cursor)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0
}

export async function listMessages(
  client: ICloudWebServiceClient,
  input: {
    folderGuid: string
    limit: number
    cursor?: string | null
    query?: string
  }
): Promise<ICloudMessagePage> {
  const limit = Math.min(Math.max(input.limit, 1), MAX_PAGE_SIZE)
  const offset = decodeCursor(input.cursor)
  const payload = await client.call(
    WM_ENDPOINTS.message,
    WM_REQUESTS.listMessages({
      folderGuid: input.folderGuid,
      limit,
      offset,
      query: input.query,
    })
  )
  assertNoPayloadError(payload, WM_ENDPOINTS.message)

  const messages = readArray(payload, ["messages", "items", "mails", "list"])
    .map(readMessageSummary)
    .filter((m): m is ICloudMessageSummary => Boolean(m))

  return {
    messages,
    // A short page means the folder is exhausted. mailws does return a total
    // count in some payloads, but relying on the page length works either way.
    nextCursor:
      messages.length < limit ? null : encodeCursor(offset + messages.length),
  }
}

/**
 * Every message in one Apple conversation, oldest first.
 *
 * Returns an empty list rather than throwing when the conversation is unknown:
 * the caller falls back to fetching the single message, which is the right
 * behaviour both for a genuinely single-message thread and for an account where
 * Apple is not returning conversation ids at all.
 */
export async function listConversation(
  client: ICloudWebServiceClient,
  conversationId: string
): Promise<ICloudMessageSummary[]> {
  const payload = await client.call(
    WM_ENDPOINTS.message,
    WM_REQUESTS.listConversation({ conversationId })
  )
  assertNoPayloadError(payload, WM_ENDPOINTS.message)
  return readArray(payload, ["messages", "items", "mails", "list"])
    .map(readMessageSummary)
    .filter((m): m is ICloudMessageSummary => Boolean(m))
}

export async function getMessage(
  client: ICloudWebServiceClient,
  input: { guid: string; folderGuid?: string }
): Promise<ICloudMessageDetail> {
  const payload = await client.call(
    WM_ENDPOINTS.message,
    WM_REQUESTS.getMessage(input)
  )
  assertNoPayloadError(payload, WM_ENDPOINTS.message)
  const detail = readMessageDetail(payload)
  if (!detail) {
    throw new ICloudProtocolError(
      `iCloud returned no message for ${input.guid}.`,
      { endpoint: WM_ENDPOINTS.message }
    )
  }
  return detail
}

export async function getAttachment(
  client: ICloudWebServiceClient,
  input: { guid: string; attachmentId: string }
): Promise<string | undefined> {
  const payload = await client.call(
    WM_ENDPOINTS.message,
    WM_REQUESTS.getAttachment(input)
  )
  assertNoPayloadError(payload, WM_ENDPOINTS.message)
  const record = readObject(payload, ["attachment", "part"])
  return str(record, "content", "data", "body")
}

export async function getRawMessage(
  client: ICloudWebServiceClient,
  guid: string
): Promise<string> {
  const payload = await client.call(
    WM_ENDPOINTS.message,
    WM_REQUESTS.getRaw({ guid })
  )
  assertNoPayloadError(payload, WM_ENDPOINTS.message)
  const record = readObject(payload, ["message", "source"])
  const source = str(record, "source", "raw", "rfc822", "content")
  if (!source) {
    throw new ICloudProtocolError(
      `iCloud returned no raw source for message ${guid}.`,
      { endpoint: WM_ENDPOINTS.message }
    )
  }
  return source
}

export async function setFlags(
  client: ICloudWebServiceClient,
  input: { guids: string[]; unread?: boolean; flagged?: boolean }
): Promise<void> {
  if (input.guids.length === 0) return
  const payload = await client.call(
    WM_ENDPOINTS.message,
    WM_REQUESTS.setFlags(input)
  )
  assertNoPayloadError(payload, WM_ENDPOINTS.message)
}

export async function moveMessages(
  client: ICloudWebServiceClient,
  input: { guids: string[]; toFolderGuid: string }
): Promise<void> {
  if (input.guids.length === 0) return
  const payload = await client.call(
    WM_ENDPOINTS.message,
    WM_REQUESTS.moveMessages(input)
  )
  assertNoPayloadError(payload, WM_ENDPOINTS.message)
}

export async function deleteMessages(
  client: ICloudWebServiceClient,
  guids: string[]
): Promise<void> {
  if (guids.length === 0) return
  const payload = await client.call(
    WM_ENDPOINTS.message,
    WM_REQUESTS.deleteMessages({ guids })
  )
  assertNoPayloadError(payload, WM_ENDPOINTS.message)
}

export async function emptyFolder(
  client: ICloudWebServiceClient,
  folderGuid: string
): Promise<void> {
  const payload = await client.call(
    WM_ENDPOINTS.folder,
    WM_REQUESTS.emptyFolder({ folderGuid })
  )
  assertNoPayloadError(payload, WM_ENDPOINTS.folder)
}

export async function createFolder(
  client: ICloudWebServiceClient,
  input: { name: string; parentGuid?: string }
): Promise<void> {
  const payload = await client.call(
    WM_ENDPOINTS.folder,
    WM_REQUESTS.createFolder(input)
  )
  assertNoPayloadError(payload, WM_ENDPOINTS.folder)
}

export async function renameFolder(
  client: ICloudWebServiceClient,
  input: { guid: string; name: string }
): Promise<void> {
  const payload = await client.call(
    WM_ENDPOINTS.folder,
    WM_REQUESTS.renameFolder(input)
  )
  assertNoPayloadError(payload, WM_ENDPOINTS.folder)
}

export async function deleteFolder(
  client: ICloudWebServiceClient,
  guid: string
): Promise<void> {
  const payload = await client.call(
    WM_ENDPOINTS.folder,
    WM_REQUESTS.deleteFolder({ guid })
  )
  assertNoPayloadError(payload, WM_ENDPOINTS.folder)
}
