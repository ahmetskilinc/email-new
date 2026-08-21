import {
  type ImapProviderConfig,
  buildLabelToFolder,
  ICLOUD_CONFIG,
  YAHOO_CONFIG,
} from "./provider-config"
// @ts-expect-error -- mailparser ships no types and @types/mailparser is not
// installed; the module resolves as `any`.
import { simpleParser, type ParsedMail, type Attachment } from "mailparser"
import { ImapFlow } from "imapflow"
import { safeError } from "../safe-error"
import { assertPublicHost } from "./host-validation"

const SPECIAL_USE_TO_LABEL: Record<string, string> = {
  "\\Sent": "SENT",
  "\\Drafts": "DRAFT",
  "\\Trash": "TRASH",
  "\\Junk": "SPAM",
  "\\Flagged": "STARRED",
  "\\Archive": "ARCHIVE",
}

/**
 * Hosts hardcoded in provider-config. Anything else came from user-supplied
 * custom-connection config and must be re-validated (and its IP pinned) at
 * connect time.
 */
const KNOWN_IMAP_HOSTS = new Set([
  ICLOUD_CONFIG.imapHost,
  YAHOO_CONFIG.imapHost,
])

export const IMAP_TIMEOUTS = {
  greetingTimeout: 10_000,
  connectionTimeout: 15_000,
  socketTimeout: 60_000,
} as const

async function makeClient(
  email: string,
  password: string,
  config: ImapProviderConfig
): Promise<ImapFlow> {
  let host = config.imapHost
  let servername: string | undefined
  if (!KNOWN_IMAP_HOSTS.has(config.imapHost)) {
    // User-supplied host: re-resolve and connect to the validated IP so DNS
    // cannot rebind to an internal address between validation and connect.
    // TLS still verifies the certificate against the original hostname.
    const [ip] = await assertPublicHost(config.imapHost, "IMAP")
    if (ip) {
      servername = config.imapHost.trim().toLowerCase()
      host = ip
    }
  }
  return new ImapFlow({
    host,
    port: config.imapPort,
    secure: true,
    ...(servername ? { tls: { servername } } : {}),
    auth: { user: email, pass: password },
    logger: false,
    ...IMAP_TIMEOUTS,
  })
}

function asUidList(result: number[] | false): number[] {
  return result === false ? [] : result
}

function getThreadRoot(
  references: string | undefined,
  messageId: string | undefined
): string {
  if (references) {
    const refs = references.trim().split(/\s+/)
    if (refs.length > 0 && refs[0]) return refs[0].replace(/[<>]/g, "").trim()
  }
  return (messageId ?? "").replace(/[<>]/g, "").trim()
}

/**
 * Extracts a single header value from a raw header block: unfolds continuation
 * lines first (RFC 5322 folding), then matches to end of line. References
 * headers in particular are almost always folded across lines.
 */
function headerValue(raw: string, name: string): string | undefined {
  const unfolded = raw.replace(/\r?\n[ \t]+/g, " ")
  const match = unfolded.match(new RegExp(`^${name}:[ \\t]*(.*)$`, "im"))
  const value = match?.[1]?.trim()
  return value || undefined
}

function parseThreadHeaders(headers?: Buffer): {
  messageId?: string
  references?: string
} {
  if (!headers) return {}
  const raw = Buffer.from(headers).toString()
  return {
    messageId: headerValue(raw, "message-id"),
    references: headerValue(raw, "references")?.replace(/\s+/g, " "),
  }
}

function threadRootFromImapFetchMsg(msg: {
  headers?: Buffer
  envelope?: { messageId?: string }
}): string {
  const parsed = parseThreadHeaders(msg.headers)
  return getThreadRoot(
    parsed.references,
    parsed.messageId ?? msg.envelope?.messageId
  )
}

function encodeThreadId(rootMsgId: string): string {
  return Buffer.from(rootMsgId).toString("base64url")
}

function decodeThreadId(threadId: string): string {
  return Buffer.from(threadId, "base64url").toString("utf-8")
}

/**
 * Message ids carry the folder the message was found in (base64url after the
 * uid) so attachment/raw fetches don't have to guess the mailbox. Plain
 * numeric ids from older clients still parse — the folder is just unknown.
 */
function encodeMessageId(uid: number, folder: string): string {
  return `${uid}:${Buffer.from(folder).toString("base64url")}`
}

function decodeMessageId(messageId: string): { uid: number; folder?: string } {
  const [uidPart, folderPart] = messageId.split(":")
  const uid = parseInt(uidPart ?? "", 10)
  let folder: string | undefined
  if (folderPart) {
    try {
      folder = Buffer.from(folderPart, "base64url").toString("utf-8")
    } catch {
      folder = undefined
    }
  }
  return { uid, folder: folder || undefined }
}

/**
 * Server-side search for all messages of a thread in the currently open
 * mailbox: the root message itself plus everything referencing it.
 */
async function searchThreadUids(
  client: ImapFlow,
  rootMsgId: string
): Promise<number[]> {
  const byMsgId = asUidList(
    await client.search(
      { header: { "Message-ID": `<${rootMsgId}>` } },
      { uid: true }
    )
  )
  const byRefs = asUidList(
    await client.search({ header: { References: rootMsgId } }, { uid: true })
  )
  return [...new Set([...byMsgId, ...byRefs])]
}

/**
 * Opens the mailbox containing `uid`. When a folder hint is present only that
 * mailbox is tried; legacy ids without a hint fall back to probing the
 * configured folders (INBOX first, matching the old behavior).
 */
async function openMessageFolder(
  client: ImapFlow,
  config: ImapProviderConfig,
  uid: number,
  folderHint: string | undefined
): Promise<string | null> {
  const candidates = folderHint
    ? [folderHint]
    : [
        config.folders.inbox,
        config.folders.archive,
        config.folders.sent,
        config.folders.trash,
        config.folders.spam,
        config.folders.drafts,
      ]
  for (const folder of candidates) {
    try {
      await client.mailboxOpen(folder, { readOnly: true })
      const found = await client.fetchOne(`${uid}`, { uid: true }, { uid: true })
      if (found) return folder
    } catch {
      // mailbox missing or fetch failed — try the next candidate
    }
  }
  return null
}

function parseAddresses(
  addr: ParsedMail["from"] | ParsedMail["to"] | ParsedMail["cc"]
) {
  if (!addr) return []
  const list =
    "value" in addr
      ? addr.value
      : (addr as { value: { name: string; address?: string }[] }).value
  if (!Array.isArray(list)) return []
  return list
    .map((a: { name: string; address?: string }) => ({
      name: a.name || undefined,
      email: a.address ?? "",
    }))
    .filter((a: { email: string }) => a.email)
}

function parsedMailToMessage(
  uid: number,
  threadId: string,
  parsed: ParsedMail,
  flags: Set<string>,
  folder: string
): Record<string, unknown> {
  const from = parseAddresses(parsed.from)
  const to = parseAddresses(parsed.to as ParsedMail["from"])
  const cc = parseAddresses(parsed.cc as ParsedMail["from"])
  const isUnread = !flags.has("\\Seen")
  const isStarred = flags.has("\\Flagged")
  const isDraft = flags.has("\\Draft")
  const labels: { id: string; name: string }[] = [
    { id: folder.toUpperCase(), name: folder },
  ]
  if (isStarred) labels.push({ id: "STARRED", name: "Starred" })
  if (isDraft) labels.push({ id: "DRAFT", name: "Drafts" })
  // Metadata only — attachment bytes are fetched on demand via
  // getAttachment/getMessageAttachments. Nothing in the rendering pipeline
  // consumes inline (cid:) content from this list, so no content is kept.
  const attachments = (parsed.attachments ?? []).map(
    (att: Attachment, i: number) => ({
      attachmentId: `${uid}:${i}`,
      filename: att.filename ?? `attachment-${i}`,
      mimeType: att.contentType ?? "application/octet-stream",
      size: att.size ?? att.content?.length ?? 0,
      body: "",
      headers: Array.from(
        (att.headers ?? new Map()) as Map<string, unknown>
      ).map(([name, value]) => ({
        name,
        value: String(value),
      })),
    })
  )
  const htmlBody = parsed.html || parsed.textAsHtml || ""
  const textBody = parsed.text || ""
  return {
    id: encodeMessageId(uid, folder),
    threadId,
    title: parsed.subject ?? "(no subject)",
    subject: parsed.subject ?? "(no subject)",
    tags: [],
    sender: from[0] ?? { email: "" },
    to,
    cc: cc.length ? cc : null,
    bcc: null,
    tls: false,
    listUnsubscribe: parsed.headers.get("list-unsubscribe") ?? undefined,
    listUnsubscribePost:
      parsed.headers.get("list-unsubscribe-post") ?? undefined,
    receivedOn: (parsed.date ?? new Date()).toISOString(),
    unread: isUnread,
    body: htmlBody || textBody,
    // Deliberately empty, matching the Gmail and Graph drivers. `processedHtml`
    // denotes sanitized output; this is raw mailparser HTML straight off the
    // wire. Assigning it here made every consumer that trusts the field — the
    // print path in particular — render attacker HTML unsanitized.
    processedHtml: "",
    blobUrl: "",
    decodedBody: htmlBody || textBody,
    references: parsed.references
      ? Array.isArray(parsed.references)
        ? parsed.references.join(" ")
        : parsed.references
      : undefined,
    inReplyTo: parsed.inReplyTo ?? undefined,
    replyTo: parsed.replyTo
      ? parseAddresses(parsed.replyTo as ParsedMail["from"])[0]?.email
      : undefined,
    messageId: parsed.messageId ?? undefined,
    attachments,
    isDraft,
    labels,
  }
}

export async function validateCredentials(
  email: string,
  password: string,
  config: ImapProviderConfig
): Promise<{ email: string; name: string }> {
  const client = await makeClient(email, password, config)
  await client.connect()
  await client.logout()
  const name = email.split("@")[0] ?? email
  return { email, name }
}

export async function listThreads(
  email: string,
  password: string,
  params: {
    folder: string
    query?: string
    maxResults: number
    pageToken: string | null
  },
  config: ImapProviderConfig
): Promise<{
  threads: { id: string; historyId: string | null; $raw?: unknown }[]
  nextPageToken: string | null
}> {
  const labelToFolder = buildLabelToFolder(config)
  const folderName = labelToFolder[params.folder.toUpperCase()] ?? params.folder
  const client = await makeClient(email, password, config)
  try {
    await client.connect()
    const mailbox = await client.mailboxOpen(folderName, { readOnly: true })
    const uidValidity = mailbox.uidValidity
    if (mailbox.exists === 0) {
      return { threads: [], nextPageToken: null }
    }

    let searchUids: number[] | null = null
    if (params.query && params.query.trim()) {
      const q = params.query.trim()
      searchUids = asUidList(
        await client.search(
          { or: [{ subject: q }, { from: q }, { to: q }, { body: q }] },
          { uid: true }
        )
      )
      if (searchUids.length === 0) {
        return { threads: [], nextPageToken: null }
      }
    }

    const fetchCount = params.maxResults * 3
    const totalMessages = mailbox.exists

    let fetchRange: string
    let fetchByUid = false
    // Search-mode cursor: offset into the sorted search result.
    let searchOffset = 0
    // Non-search modes: whether an older page exists past this one.
    let hasOlder = false

    if (searchUids) {
      const sorted = [...searchUids].sort((a, b) => b - a)
      const pageStart = params.pageToken ? parseInt(params.pageToken, 10) : 0
      const sliced = sorted.slice(pageStart, pageStart + fetchCount)
      if (sliced.length === 0) return { threads: [], nextPageToken: null }
      fetchRange = sliced.join(",")
      fetchByUid = true
      searchOffset = pageStart + sliced.length
    } else if (params.pageToken?.startsWith("u")) {
      // UID-based page token ("u<uid>"): everything strictly older than the
      // oldest UID of the previous page. Stable across expunges, unlike the
      // legacy sequence-number tokens.
      const beforeUid = parseInt(params.pageToken.slice(1), 10)
      if (!Number.isFinite(beforeUid) || beforeUid <= 1) {
        return { threads: [], nextPageToken: null }
      }
      const olderUids = asUidList(
        await client.search({ uid: `1:${beforeUid - 1}` }, { uid: true })
      ).sort((a, b) => b - a)
      if (olderUids.length === 0) return { threads: [], nextPageToken: null }
      const sliced = olderUids.slice(0, fetchCount)
      fetchRange = sliced.join(",")
      fetchByUid = true
      hasOlder = olderUids.length > sliced.length
    } else {
      // First page (or a legacy numeric sequence token from an older client).
      let seqEnd: number
      if (params.pageToken) {
        seqEnd = parseInt(params.pageToken, 10) - 1
        if (seqEnd < 1) return { threads: [], nextPageToken: null }
      } else {
        seqEnd = totalMessages
      }
      const seqStart = Math.max(1, seqEnd - fetchCount + 1)
      fetchRange = `${seqStart}:${seqEnd}`
      hasOlder = seqStart > 1
    }

    const messages: {
      uid: number
      seq: number
      messageId?: string
      references?: string
      date?: Date
      flags: Set<string>
      subject?: string
      from?: { name?: string; address?: string }
    }[] = []
    const fetchOptions = fetchByUid ? { uid: true } : undefined
    for await (const msg of client.fetch(
      fetchRange,
      {
        uid: true,
        flags: true,
        envelope: true,
        headers: ["message-id", "references", "in-reply-to"],
      },
      fetchOptions
    )) {
      const parsedHeaders = parseThreadHeaders(msg.headers)
      messages.push({
        uid: msg.uid,
        seq: msg.seq,
        messageId: parsedHeaders.messageId ?? msg.envelope?.messageId,
        references: parsedHeaders.references,
        date: msg.envelope?.date ?? undefined,
        flags: msg.flags ?? new Set(),
        subject: msg.envelope?.subject ?? undefined,
        from: msg.envelope?.from?.[0] ?? undefined,
      })
    }
    messages.sort((a, b) => {
      const da = a.date?.getTime() ?? 0
      const db = b.date?.getTime() ?? 0
      return db - da || b.uid - a.uid
    })
    const threadMap = new Map<string, typeof messages>()
    for (const msg of messages) {
      const rootMsgId = getThreadRoot(msg.references, msg.messageId)
      if (!threadMap.has(rootMsgId)) threadMap.set(rootMsgId, [])
      threadMap.get(rootMsgId)!.push(msg)
    }
    const threadEntries = Array.from(threadMap.entries()).slice(
      0,
      params.maxResults
    )
    const threads = threadEntries.map(([rootMsgId, msgs]) => {
      const latestMsg = msgs[0]!
      const isUnread = !latestMsg.flags.has("\\Seen")
      const isStarred = msgs.some((m) => m.flags.has("\\Flagged"))
      return {
        id: encodeThreadId(rootMsgId),
        historyId: `${uidValidity}:${latestMsg.uid}`,
        $raw: {
          uids: msgs.map((m) => m.uid),
          preview: {
            sender: {
              name: latestMsg.from?.name ?? "",
              email: latestMsg.from?.address ?? "",
            },
            subject: latestMsg.subject ?? "(no subject)",
            receivedOn:
              latestMsg.date?.toISOString() ?? new Date().toISOString(),
            unread: isUnread,
            starred: isStarred,
            totalReplies: msgs.filter((m) => !m.flags.has("\\Draft")).length,
          },
        },
      }
    })
    let nextPageToken: string | null = null
    if (searchUids) {
      if (
        searchOffset < searchUids.length &&
        threads.length >= params.maxResults
      ) {
        nextPageToken = String(searchOffset)
      }
    } else if (hasOlder && threads.length >= params.maxResults) {
      const minUid = Math.min(...messages.map((m) => m.uid))
      if (minUid > 1) nextPageToken = `u${minUid}`
    }
    return { threads, nextPageToken }
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function getThread(
  email: string,
  password: string,
  threadId: string,
  config: ImapProviderConfig
): Promise<{
  messages: Record<string, unknown>[]
  latest?: Record<string, unknown>
  hasUnread: boolean
  totalReplies: number
  labels: { id: string; name: string }[]
  isLatestDraft?: boolean
}> {
  const rootMsgId = decodeThreadId(threadId)
  const client = await makeClient(email, password, config)

  const scanFolder = async (
    folder: string
  ): Promise<Record<string, unknown>[]> => {
    try {
      const mailbox = await client.mailboxOpen(folder, { readOnly: true })
      if (!mailbox.exists || mailbox.exists === 0) return []

      const matchingUids = await searchThreadUids(client, rootMsgId)
      if (matchingUids.length === 0) return []

      const msgs: Record<string, unknown>[] = []
      for await (const msg of client.fetch(
        matchingUids.join(","),
        { source: true, flags: true, uid: true },
        { uid: true }
      )) {
        if (!msg.source) continue
        const parsed = await simpleParser(Buffer.from(msg.source))
        msgs.push(
          parsedMailToMessage(
            msg.uid,
            threadId,
            parsed,
            msg.flags ?? new Set(),
            folder
          )
        )
      }
      return msgs
    } catch (err) {
      console.error(`[imap:getThread] scanFolder ${folder} error`, err)
      return []
    }
  }

  try {
    await client.connect()
    const allMessages: Record<string, unknown>[] = []
    let foundFolder = "INBOX"

    const inboxMsgs = await scanFolder(config.folders.inbox)
    if (inboxMsgs.length > 0) {
      allMessages.push(...inboxMsgs)
      foundFolder = config.folders.inbox
      const sentMsgs = await scanFolder(config.folders.sent)
      allMessages.push(...sentMsgs)
    } else {
      for (const folder of [
        config.folders.archive,
        config.folders.sent,
        config.folders.drafts,
        config.folders.trash,
        config.folders.spam,
      ]) {
        const msgs = await scanFolder(folder)
        if (msgs.length > 0) {
          allMessages.push(...msgs)
          if (allMessages.length === msgs.length) foundFolder = folder
        }
      }
    }
    allMessages.sort(
      (a, b) =>
        new Date(a["receivedOn"] as string).getTime() -
        new Date(b["receivedOn"] as string).getTime()
    )
    const hasUnread = allMessages.some((m) => m["unread"] === true)
    const nonDrafts = allMessages.filter((m) => !m["isDraft"])
    const latest = allMessages[allMessages.length - 1]

    return {
      messages: allMessages,
      latest,
      hasUnread,
      totalReplies: nonDrafts.length,
      labels: [{ id: foundFolder.toUpperCase(), name: foundFolder }],
      isLatestDraft: latest?.["isDraft"] === true,
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function deleteMessages(
  email: string,
  password: string,
  threadId: string,
  config: ImapProviderConfig
): Promise<void> {
  const rootMsgId = decodeThreadId(threadId)
  const client = await makeClient(email, password, config)
  try {
    await client.connect()
    for (const folder of [
      config.folders.inbox,
      config.folders.archive,
      config.folders.sent,
      config.folders.drafts,
      config.folders.spam,
    ]) {
      try {
        const mailbox = await client.mailboxOpen(folder)
        if (!mailbox.exists || mailbox.exists === 0) continue
        const uids = await searchThreadUids(client, rootMsgId)
        if (uids.length > 0)
          await client.messageMove(uids, config.folders.trash, { uid: true })
      } catch {
        // skip folders that don't exist or can't be opened
      }
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function markMessages(
  email: string,
  password: string,
  threadIds: string[],
  read: boolean,
  config: ImapProviderConfig
): Promise<void> {
  const targets = [
    ...new Set(threadIds.map((tid) => decodeThreadId(tid)).filter((r) => !!r)),
  ] as string[]
  if (targets.length === 0) return

  const client = await makeClient(email, password, config)
  try {
    await client.connect()
    for (const folder of [
      config.folders.inbox,
      config.folders.sent,
      config.folders.drafts,
      config.folders.spam,
      config.folders.archive,
    ]) {
      try {
        const mailbox = await client.mailboxOpen(folder)
        if (!mailbox.exists || mailbox.exists === 0) continue

        const uids = new Set<number>()
        for (const rootMsgId of targets) {
          for (const uid of await searchThreadUids(client, rootMsgId)) {
            uids.add(uid)
          }
        }
        if (uids.size === 0) continue
        const uidList = [...uids]
        if (read)
          await client.messageFlagsAdd(uidList, ["\\Seen"], { uid: true })
        else
          await client.messageFlagsRemove(uidList, ["\\Seen"], { uid: true })
      } catch {}
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function modifyLabels(
  email: string,
  password: string,
  threadIds: string[],
  addLabels: string[],
  removeLabels: string[],
  config: ImapProviderConfig
): Promise<void> {
  const labelToFolder = buildLabelToFolder(config)
  const targets = [
    ...new Set(threadIds.map((tid) => decodeThreadId(tid)).filter((r) => !!r)),
  ] as string[]
  if (targets.length === 0) return

  // Flag/move decisions depend only on the labels, not on the thread, so
  // compute them once and do a single pass per folder for every thread.
  const addFlags: string[] = []
  const removeFlags: string[] = []
  const moveToFolder = addLabels.find((l) => labelToFolder[l.toUpperCase()])
  const removeFromLabel = removeLabels.find(
    (l) => labelToFolder[l.toUpperCase()]
  )
  if (addLabels.includes("STARRED") || addLabels.includes("IMPORTANT"))
    addFlags.push("\\Flagged")
  if (removeLabels.includes("STARRED") || removeLabels.includes("IMPORTANT"))
    removeFlags.push("\\Flagged")

  const client = await makeClient(email, password, config)
  try {
    await client.connect()
    const sourceFolders = [
      config.folders.inbox,
      config.folders.sent,
      config.folders.drafts,
      config.folders.trash,
      config.folders.spam,
      config.folders.archive,
    ]
    for (const folder of sourceFolders) {
      try {
        await client.mailboxOpen(folder)
        const uidSet = new Set<number>()
        for (const rootMsgId of targets) {
          for (const uid of await searchThreadUids(client, rootMsgId)) {
            uidSet.add(uid)
          }
        }
        if (uidSet.size === 0) continue
        const uids = [...uidSet]
        if (addFlags.length)
          await client.messageFlagsAdd(uids, addFlags, { uid: true })
        if (removeFlags.length)
          await client.messageFlagsRemove(uids, removeFlags, { uid: true })
        if (moveToFolder) {
          const targetFolder = labelToFolder[moveToFolder.toUpperCase()]
          if (targetFolder && targetFolder !== folder)
            await client.messageMove(uids, targetFolder, { uid: true })
        }
        if (removeFromLabel === "INBOX" && !moveToFolder)
          await client.messageMove(uids, config.folders.archive, {
            uid: true,
          })
      } catch {}
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function listFolders(
  email: string,
  password: string,
  config: ImapProviderConfig
): Promise<{ id: string; name: string; type: string }[]> {
  const client = await makeClient(email, password, config)
  try {
    await client.connect()
    const mailboxes = await client.list()
    return mailboxes.map((mb) => {
      let labelId = mb.path.toUpperCase()
      for (const [attr, id] of Object.entries(SPECIAL_USE_TO_LABEL)) {
        if (mb.specialUse === attr || (mb.flags && mb.flags.has(attr))) {
          labelId = id
          break
        }
      }
      if (mb.specialUse === "\\Inbox" || mb.path.toLowerCase() === "inbox")
        labelId = "INBOX"
      return {
        id: labelId,
        name: mb.name,
        type: labelId === "INBOX" ? "system" : "user",
      }
    })
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function countUnread(
  email: string,
  password: string,
  config: ImapProviderConfig
): Promise<{ count?: number; label?: string }[]> {
  const client = await makeClient(email, password, config)
  try {
    await client.connect()
    const counts: { count?: number; label?: string }[] = []
    const folders = [
      { folder: config.folders.inbox, label: "INBOX" },
      { folder: config.folders.drafts, label: "DRAFT" },
      { folder: config.folders.sent, label: "SENT" },
    ]
    for (const { folder, label } of folders) {
      try {
        // STATUS avoids SELECTing each mailbox just to read a counter.
        const status = await client.status(folder, { unseen: true })
        counts.push({ label, count: status.unseen ?? 0 })
      } catch {
        counts.push({ label, count: 0 })
      }
    }
    return counts
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function getRawEmail(
  email: string,
  password: string,
  messageId: string,
  config: ImapProviderConfig
): Promise<string> {
  const { uid, folder } = decodeMessageId(messageId)
  if (isNaN(uid)) throw new Error("Invalid messageId")
  const client = await makeClient(email, password, config)
  try {
    await client.connect()
    const found = await openMessageFolder(client, config, uid, folder)
    if (!found) return ""
    let rawEmail = ""
    for await (const msg of client.fetch(
      `${uid}`,
      { source: true },
      { uid: true }
    )) {
      if (msg.source) rawEmail = Buffer.from(msg.source).toString()
    }
    return rawEmail
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function getAttachment(
  email: string,
  password: string,
  messageId: string,
  attachmentId: string,
  config: ImapProviderConfig
): Promise<string> {
  const { uid, folder } = decodeMessageId(messageId)
  if (isNaN(uid)) return ""
  const partIndex = parseInt(attachmentId.split(":")[1] ?? "0", 10)
  const client = await makeClient(email, password, config)
  try {
    await client.connect()
    const found = await openMessageFolder(client, config, uid, folder)
    if (!found) return ""
    for await (const msg of client.fetch(
      `${uid}`,
      { source: true },
      { uid: true }
    )) {
      if (!msg.source) continue
      const parsed = await simpleParser(Buffer.from(msg.source))
      const att = parsed.attachments?.[partIndex]
      if (att?.content) return att.content.toString("base64")
    }
    return ""
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function getMessageAttachments(
  email: string,
  password: string,
  messageId: string,
  config: ImapProviderConfig
): Promise<
  {
    filename: string
    mimeType: string
    size: number
    attachmentId: string
    headers: { name: string; value: string }[]
    body: string
  }[]
> {
  const { uid, folder } = decodeMessageId(messageId)
  if (isNaN(uid)) return []
  const client = await makeClient(email, password, config)
  try {
    await client.connect()
    const found = await openMessageFolder(client, config, uid, folder)
    if (!found) return []
    for await (const msg of client.fetch(
      `${uid}`,
      { source: true },
      { uid: true }
    )) {
      if (!msg.source) continue
      const parsed = await simpleParser(Buffer.from(msg.source))
      return (parsed.attachments ?? []).map((att: Attachment, i: number) => ({
        attachmentId: `${uid}:${i}`,
        filename: att.filename ?? `attachment-${i}`,
        mimeType: att.contentType ?? "application/octet-stream",
        size: att.size ?? att.content?.length ?? 0,
        body: att.content?.toString("base64") ?? "",
        headers: Array.from(
        (att.headers ?? new Map()) as Map<string, unknown>
      ).map(([name, value]) => ({
          name,
          value: String(value),
        })),
      }))
    }
    return []
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function getAliases(
  email: string
): Promise<{ email: string; name?: string; primary?: boolean }[]> {
  return [{ email, primary: true }]
}

export async function listHistory(
  email: string,
  password: string,
  historyId: string,
  config: ImapProviderConfig
): Promise<{ history: unknown[]; historyId: string }> {
  const parts = historyId.split(":")
  const storedUidValidity = parts[0] ?? ""
  const lastUid = parseInt(parts[1] ?? "0", 10)
  const client = await makeClient(email, password, config)
  try {
    await client.connect()
    const mailbox = await client.mailboxOpen(config.folders.inbox, {
      readOnly: true,
    })
    const uidValidity = mailbox.uidValidity
    if (storedUidValidity && storedUidValidity !== `${uidValidity}`) {
      // UIDVALIDITY changed: every UID the caller has stored is meaningless.
      // Signal a full resync instead of returning phantom "new" messages.
      const latestUid = Math.max(0, Number(mailbox.uidNext ?? 1) - 1)
      return {
        history: [{ type: "fullResync" }],
        historyId: `${uidValidity}:${latestUid}`,
      }
    }
    // `lastUid+1:*` quirk: if lastUid is already the highest UID, the server
    // interprets the range as `*:*` and returns that last message again —
    // filter to strictly-newer UIDs.
    const newUids = asUidList(
      await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })
    ).filter((uid) => uid > lastUid)
    const history = newUids.map((uid) => ({ uid, type: "new" }))
    const latestUid = newUids.length > 0 ? Math.max(...newUids) : lastUid
    return { history, historyId: `${uidValidity}:${latestUid}` }
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function deleteAllSpam(
  email: string,
  password: string,
  config: ImapProviderConfig
): Promise<{ success: boolean; message: string; count?: number }> {
  let client: ImapFlow
  try {
    client = await makeClient(email, password, config)
  } catch (e) {
    return { success: false, message: safeError("imap.deleteAllSpam", e).message }
  }
  try {
    await client.connect()
    await client.mailboxOpen(config.folders.spam)
    const allUids = asUidList(await client.search({ all: true }, { uid: true }))
    if (allUids.length === 0)
      return {
        success: true,
        message: "Junk folder is already empty",
        count: 0,
      }
    await client.messageDelete(allUids, { uid: true })
    return {
      success: true,
      message: `Deleted ${allUids.length} junk messages`,
      count: allUids.length,
    }
  } catch (e) {
    // Never return the raw error: it carries the resolved host, port and socket
    // state for a caller-supplied endpoint.
    return { success: false, message: safeError("imap.deleteAllSpam", e).message }
  } finally {
    await client.logout().catch(() => {})
  }
}
