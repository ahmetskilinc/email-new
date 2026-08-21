/**
 * Translation between Apple's mailws representation and the app's internal
 * message/label vocabulary.
 *
 * This is the boundary the provider architecture exists to enforce: no mailws
 * concept (folder GUIDs, Apple flag names, conversation ids) may travel past
 * here into the rest of the mail app.
 */
import type { Label, ParsedMessage } from "../../../types"
import type {
  ICloudFolder,
  ICloudMessageDetail,
  ICloudMessageSummary,
} from "./types"

/** Internal label ids the app already uses across every provider. */
export const ROLE_TO_LABEL_ID: Record<
  NonNullable<ICloudFolder["role"]>,
  string
> = {
  inbox: "INBOX",
  sent: "SENT",
  drafts: "DRAFT",
  trash: "TRASH",
  junk: "SPAM",
  archive: "ARCHIVE",
}

export const LABEL_ID_TO_ROLE: Record<string, ICloudFolder["role"]> =
  Object.fromEntries(
    Object.entries(ROLE_TO_LABEL_ID).map(([role, id]) => [
      id,
      role as ICloudFolder["role"],
    ])
  )

/**
 * Stable label id for a folder. Well-known folders get the shared vocabulary so
 * the UI's Inbox/Sent/Trash buttons keep working; user folders are addressed by
 * their upper-cased name, matching what the IMAP driver does.
 */
export function folderLabelId(folder: ICloudFolder): string {
  if (folder.role) return ROLE_TO_LABEL_ID[folder.role]
  return folder.name.toUpperCase()
}

export function folderToLabel(folder: ICloudFolder): Label {
  const id = folderLabelId(folder)
  return {
    id,
    name: folder.name,
    type: folder.role ? "system" : "user",
  } as Label
}

/**
 * Resolves the label/folder name a caller asked for to a concrete Apple folder.
 *
 * Callers pass either a well-known label id ("INBOX", "SENT") or a folder name;
 * both have to work, because the sidebar and the sync workflow disagree about
 * which they use.
 */
export function resolveFolder(
  folders: ICloudFolder[],
  requested: string
): ICloudFolder | undefined {
  const wanted = requested.trim()
  if (!wanted) return folders.find((f) => f.role === "inbox")

  const upper = wanted.toUpperCase()
  const role = LABEL_ID_TO_ROLE[upper]
  if (role) {
    const byRole = folders.find((f) => f.role === role)
    if (byRole) return byRole
  }
  return (
    folders.find((f) => f.guid === wanted) ??
    folders.find((f) => f.name.toUpperCase() === upper) ??
    folders.find((f) => folderLabelId(f) === upper)
  )
}

/** Apple's conversation id when it has one, else the message itself. */
export function threadIdFor(message: ICloudMessageSummary): string {
  return message.conversationId ?? message.guid
}

function labelsFor(
  message: ICloudMessageSummary,
  folder?: ICloudFolder
): { id: string; name: string }[] {
  const labels: { id: string; name: string }[] = []
  if (folder) labels.push({ id: folderLabelId(folder), name: folder.name })
  if (message.flagged) labels.push({ id: "STARRED", name: "Starred" })
  if (message.draft) labels.push({ id: "DRAFT", name: "Drafts" })
  if (message.unread) labels.push({ id: "UNREAD", name: "Unread" })
  return labels
}

/**
 * Builds the app's `ParsedMessage` from an Apple message.
 *
 * `processedHtml` is deliberately left empty, matching every other driver:
 * that field means "sanitized", and this HTML is raw off the wire. Filling it
 * here would hand unsanitized attacker HTML to the consumers that trust it.
 */
export function toParsedMessage(
  message: ICloudMessageDetail | ICloudMessageSummary,
  options: { folder?: ICloudFolder; connectionId?: string } = {}
): ParsedMessage {
  const detail = message as ICloudMessageDetail
  const html = detail.html ?? ""
  const text = detail.text ?? detail.snippet ?? ""
  const body = html || text

  return {
    id: message.guid,
    ...(options.connectionId ? { connectionId: options.connectionId } : {}),
    threadId: threadIdFor(message),
    title: message.subject,
    subject: message.subject,
    tags: [],
    sender: message.from ?? { email: "" },
    to: message.to,
    cc: message.cc.length ? message.cc : null,
    bcc: message.bcc.length ? message.bcc : null,
    tls: true,
    listUnsubscribe: detail.listUnsubscribe,
    listUnsubscribePost: detail.listUnsubscribePost,
    receivedOn: message.date,
    unread: message.unread,
    body,
    processedHtml: "",
    blobUrl: "",
    decodedBody: body,
    references: message.references,
    inReplyTo: message.inReplyTo,
    replyTo: message.replyTo,
    messageId: message.messageId,
    attachments: (detail.attachments ?? []).map((attachment) => ({
      attachmentId: attachment.attachmentId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      body: attachment.body,
      headers: [],
    })),
    isDraft: message.draft,
    labels: labelsFor(message, options.folder),
  } as unknown as ParsedMessage
}

/**
 * Collapses a page of messages into thread rows.
 *
 * The list endpoints elsewhere in the app return one entry per thread, newest
 * first, so a folder listing that returned one entry per message would show
 * visible duplicates in the mail list.
 */
export function toThreadRows(
  messages: ICloudMessageSummary[]
): { id: string; historyId: string | null; $raw?: unknown }[] {
  const seen = new Map<
    string,
    { id: string; historyId: string | null; $raw?: unknown }
  >()
  for (const message of messages) {
    const id = threadIdFor(message)
    if (seen.has(id)) continue
    seen.set(id, {
      id,
      historyId: String(new Date(message.date).getTime()),
      $raw: message,
    })
  }
  return Array.from(seen.values())
}
