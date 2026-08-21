import nodemailer from "nodemailer"
import { ImapFlow } from "imapflow"
// @ts-expect-error -- mailparser ships no types and @types/mailparser is not
// installed; the module resolves as `any`.
import { simpleParser, type AddressObject } from "mailparser"
import {
  type ImapProviderConfig,
  ICLOUD_CONFIG,
  YAHOO_CONFIG,
} from "./provider-config"
import { safeError } from "../safe-error"
import { assertPublicHost } from "./host-validation"
import { IMAP_TIMEOUTS } from "./imap"

interface OutgoingMessage {
  to: { name?: string; email: string }[]
  cc?: { name?: string; email: string }[]
  bcc?: { name?: string; email: string }[]
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
  threadId?: string
  fromEmail?: string
}

interface DraftData {
  to?: { name?: string; email: string }[]
  cc?: { name?: string; email: string }[]
  bcc?: { name?: string; email: string }[]
  subject?: string
  message?: string
  attachments?: {
    name: string
    type: string
    size: number
    base64: string
  }[]
  threadId?: string
}

interface ParsedDraftContent {
  id: string
  to?: string[]
  subject?: string
  content?: string
  cc?: string[]
  bcc?: string[]
  rawMessage?: { internalDate?: string | null }
}

/**
 * Hosts hardcoded in provider-config. Anything else came from user-supplied
 * custom-connection config and must be re-validated (and its IP pinned) at
 * connect time.
 */
const KNOWN_SMTP_HOSTS = new Set([
  ICLOUD_CONFIG.smtpHost,
  YAHOO_CONFIG.smtpHost,
])
const KNOWN_IMAP_HOSTS = new Set([
  ICLOUD_CONFIG.imapHost,
  YAHOO_CONFIG.imapHost,
])

async function makeTransport(
  email: string,
  password: string,
  config: ImapProviderConfig = ICLOUD_CONFIG
) {
  let host = config.smtpHost
  let servername: string | undefined
  if (!KNOWN_SMTP_HOSTS.has(config.smtpHost)) {
    // User-supplied host: re-resolve and connect to the validated IP so DNS
    // cannot rebind to an internal address between validation and connect.
    // TLS still verifies the certificate against the original hostname.
    const [ip] = await assertPublicHost(config.smtpHost, "SMTP")
    if (ip) {
      servername = config.smtpHost.trim().toLowerCase()
      host = ip
    }
  }
  return nodemailer.createTransport({
    host,
    port: config.smtpPort,
    secure: config.smtpSecure,
    requireTLS: config.smtpRequireTLS,
    ...(servername ? { tls: { servername } } : {}),
    auth: { user: email, pass: password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 60_000,
    dnsTimeout: 10_000,
  })
}

async function makeClient(
  email: string,
  password: string,
  config: ImapProviderConfig = ICLOUD_CONFIG
): Promise<ImapFlow> {
  let host = config.imapHost
  let servername: string | undefined
  if (!KNOWN_IMAP_HOSTS.has(config.imapHost)) {
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

/**
 * Display names come from user/provider data: strip CR/LF so a crafted name
 * cannot inject headers, and escape quotes/backslashes so the quoted-string
 * stays a quoted-string.
 */
function sanitizeDisplayName(name: string): string {
  return name.replace(/[\r\n]+/g, " ").replace(/(["\\])/g, "\\$1").trim()
}

function formatAddresses(list: { name?: string; email: string }[]): string {
  return list
    .map((a) =>
      a.name ? `"${sanitizeDisplayName(a.name)}" <${a.email}>` : a.email
    )
    .join(", ")
}

/** Renders mail options to a raw RFC822 message via a stream transport. */
async function buildRawMessage(
  mailOptions: nodemailer.SendMailOptions
): Promise<string> {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
  })
  const info = await transport.sendMail(mailOptions)
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    const stream = info.message as NodeJS.ReadableStream
    stream.on("data", (chunk: Buffer) => chunks.push(chunk))
    stream.on("end", () => resolve(Buffer.concat(chunks).toString()))
    stream.on("error", reject)
  })
}

function buildMailOptions(
  email: string,
  message: OutgoingMessage
): nodemailer.SendMailOptions {
  return {
    from: message.fromEmail ? `${email} <${message.fromEmail}>` : email,
    to: formatAddresses(message.to),
    cc: message.cc ? formatAddresses(message.cc) : undefined,
    bcc: message.bcc ? formatAddresses(message.bcc) : undefined,
    subject: message.subject,
    html: message.message,
    attachments: (message.attachments ?? []).map((att) => ({
      filename: att.name,
      content: att.base64,
      encoding: "base64",
      contentType: att.type,
    })),
    headers: message.headers,
  }
}

export async function sendEmail(
  email: string,
  password: string,
  message: OutgoingMessage,
  config: ImapProviderConfig = ICLOUD_CONFIG
): Promise<{ id?: string | null }> {
  const transport = await makeTransport(email, password, config)
  const mailOptions = buildMailOptions(email, message)
  const info = await transport.sendMail(mailOptions)
  const rejected = (info.rejected ?? []).map((r) =>
    typeof r === "string" ? r : (r.address ?? String(r))
  )
  const accepted = info.accepted ?? []

  // Plain IMAP servers don't auto-save outgoing mail, so append a copy to the
  // Sent folder (unless the provider's SMTP does it itself, e.g. Yahoo —
  // appending there duplicates every message). Runs before the rejection
  // check: a partially-accepted message was delivered and belongs in Sent.
  // Best effort: the message is already on the wire, so a failure here must
  // never fail the send.
  if (accepted.length > 0 && !config.smtpSavesSent) {
    try {
      const raw = await buildRawMessage(mailOptions)
      const client = await makeClient(email, password, config)
      try {
        await client.connect()
        await client.append(config.folders.sent, raw, ["\\Seen"])
      } finally {
        await client.logout().catch(() => {})
      }
    } catch (e) {
      console.error("[smtp:sendEmail] failed to append to Sent folder", e)
    }
  }

  if (rejected.length > 0) {
    // Distinguish partial delivery: resending the whole message would
    // duplicate it for the recipients that were accepted.
    const clientMessage =
      accepted.length > 0
        ? `The email was delivered, but the server rejected these recipients: ${rejected.join(", ")}. Resend to those addresses only.`
        : `The server rejected these recipients: ${rejected.join(", ")}.`
    const { message: msg } = safeError(
      "smtp.sendEmail",
      new Error(`recipients rejected: ${rejected.join(", ")}`),
      clientMessage
    )
    throw new Error(msg)
  }

  return { id: info.messageId ?? null }
}

function parseDraftAddressList(
  addr: AddressObject | AddressObject[] | undefined
): string[] {
  if (!addr) return []
  return (Array.isArray(addr) ? addr : [addr])
    .flatMap((a) => ("value" in a ? a.value : [a]))
    .map((a: { address?: string }) => a.address ?? "")
    .filter(Boolean)
}

/** Reads and parses one draft from the currently connected client. */
async function readDraft(
  client: ImapFlow,
  draftId: string,
  config: ImapProviderConfig,
  options: { readOnly?: boolean } = {}
): Promise<ParsedDraftContent> {
  await client.mailboxOpen(config.folders.drafts, {
    readOnly: options.readOnly ?? false,
  })
  const uid = parseInt(draftId, 10)
  if (isNaN(uid)) throw new Error(`Invalid draftId: ${draftId}`)
  for await (const msg of client.fetch(
    `${uid}`,
    { source: true, uid: true },
    { uid: true }
  )) {
    if (!msg.source) continue
    const parsed = await simpleParser(Buffer.from(msg.source))
    return {
      id: draftId,
      to: parseDraftAddressList(parsed.to),
      cc: parseDraftAddressList(parsed.cc),
      bcc: [],
      subject: parsed.subject ?? "",
      content: parsed.html || parsed.text || "",
      rawMessage: { internalDate: parsed.date?.toISOString() ?? null },
    }
  }
  throw new Error(`Draft ${draftId} not found`)
}

export async function sendDraft(
  email: string,
  password: string,
  draftId: string,
  message: OutgoingMessage,
  config: ImapProviderConfig = ICLOUD_CONFIG
): Promise<void> {
  const client = await makeClient(email, password, config)
  try {
    await client.connect()
    const draft = await readDraft(client, draftId, config)
    // Explicit field mapping: the stored draft uses plain address strings and
    // a `content` field, which don't line up with OutgoingMessage's shape.
    const merged: OutgoingMessage = {
      to: message.to?.length
        ? message.to
        : (draft.to ?? []).map((address) => ({ email: address })),
      cc:
        message.cc ??
        (draft.cc?.length
          ? draft.cc.map((address) => ({ email: address }))
          : undefined),
      bcc: message.bcc,
      subject: message.subject ?? draft.subject ?? "",
      message: message.message ?? draft.content ?? "",
      attachments: message.attachments,
      headers: message.headers,
      threadId: message.threadId,
      fromEmail: message.fromEmail,
    }
    await sendEmail(email, password, merged, config)
    const uid = parseInt(draftId, 10)
    if (!isNaN(uid)) {
      // Drafts mailbox is still selected from readDraft; delete on the same
      // connection instead of reconnecting.
      await client.messageDelete([uid], { uid: true })
    }
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function createDraft(
  email: string,
  password: string,
  draft: DraftData,
  config: ImapProviderConfig = ICLOUD_CONFIG
): Promise<{ id?: string | null; success?: boolean; error?: string }> {
  let client: ImapFlow
  try {
    client = await makeClient(email, password, config)
  } catch (e) {
    return { success: false, error: safeError("smtp.createDraft", e).message }
  }
  try {
    await client.connect()
    const mailOptions: nodemailer.SendMailOptions = {
      from: email,
      to: draft.to ? formatAddresses(draft.to) : "",
      cc: draft.cc ? formatAddresses(draft.cc) : undefined,
      bcc: draft.bcc ? formatAddresses(draft.bcc) : undefined,
      subject: draft.subject ?? "",
      html: draft.message ?? "",
      attachments: (draft.attachments ?? []).map((att) => ({
        filename: att.name,
        content: att.base64,
        encoding: "base64",
        contentType: att.type,
      })),
    }
    const rawMessage = await buildRawMessage(mailOptions)
    const appendResult = await client.append(
      config.folders.drafts,
      rawMessage,
      ["\\Draft", "\\Seen"]
    )
    const uid = appendResult ? appendResult.uid : undefined
    return { id: String(uid ?? "unknown"), success: true }
  } catch (e) {
    // Never return the raw error: it carries the resolved host, port and socket
    // state for a caller-supplied endpoint.
    return { success: false, error: safeError("smtp.createDraft", e).message }
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function getDraft(
  email: string,
  password: string,
  draftId: string,
  config: ImapProviderConfig = ICLOUD_CONFIG
): Promise<ParsedDraftContent> {
  const client = await makeClient(email, password, config)
  try {
    await client.connect()
    return await readDraft(client, draftId, config, { readOnly: true })
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function listDrafts(
  email: string,
  password: string,
  params: { maxResults?: number; pageToken?: string },
  config: ImapProviderConfig = ICLOUD_CONFIG
): Promise<{
  threads: { id: string; historyId: string | null; $raw: unknown }[]
  nextPageToken: string | null
}> {
  const client = await makeClient(email, password, config)
  try {
    await client.connect()
    const mailbox = await client.mailboxOpen(config.folders.drafts, {
      readOnly: true,
    })
    const uidValidity = mailbox.uidValidity
    if (mailbox.exists === 0) return { threads: [], nextPageToken: null }
    const startUid = params.pageToken ? parseInt(params.pageToken, 10) : 1
    const maxResults = params.maxResults ?? 50
    const threads: { id: string; historyId: string | null; $raw: unknown }[] =
      []
    for await (const msg of client.fetch(
      `${startUid}:*`,
      { uid: true, envelope: true },
      { uid: true }
    )) {
      if (threads.length >= maxResults) break
      threads.push({
        id: String(msg.uid),
        historyId: `${uidValidity}:${msg.uid}`,
        $raw: { uid: msg.uid, subject: msg.envelope?.subject },
      })
    }
    const lastId = threads[threads.length - 1]?.id
    const nextPageToken =
      threads.length >= maxResults && lastId
        ? String(parseInt(lastId, 10) + 1)
        : null
    return { threads, nextPageToken }
  } finally {
    await client.logout().catch(() => {})
  }
}

export async function deleteDraft(
  email: string,
  password: string,
  draftId: string,
  config: ImapProviderConfig = ICLOUD_CONFIG
): Promise<void> {
  const client = await makeClient(email, password, config)
  try {
    await client.connect()
    await client.mailboxOpen(config.folders.drafts)
    const uid = parseInt(draftId, 10)
    if (isNaN(uid)) throw new Error(`Invalid draftId: ${draftId}`)
    await client.messageDelete([uid], { uid: true })
  } finally {
    await client.logout().catch(() => {})
  }
}
