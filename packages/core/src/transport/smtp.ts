// @ts-nocheck
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { type ImapProviderConfig, ICLOUD_CONFIG } from './provider-config';

interface OutgoingMessage {
  to: { name?: string; email: string }[];
  cc?: { name?: string; email: string }[];
  bcc?: { name?: string; email: string }[];
  subject: string;
  message: string;
  attachments?: {
    name: string;
    type: string;
    size: number;
    lastModified: number;
    base64: string;
  }[];
  headers?: Record<string, string>;
  threadId?: string;
  fromEmail?: string;
}

interface DraftData {
  to?: { name?: string; email: string }[];
  cc?: { name?: string; email: string }[];
  bcc?: { name?: string; email: string }[];
  subject?: string;
  message?: string;
  attachments?: {
    name: string;
    type: string;
    size: number;
    base64: string;
  }[];
  threadId?: string;
}

function makeTransport(email: string, password: string, config: ImapProviderConfig = ICLOUD_CONFIG) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    requireTLS: config.smtpRequireTLS,
    auth: { user: email, pass: password },
  });
}

function makeClient(email: string, password: string, config: ImapProviderConfig = ICLOUD_CONFIG): ImapFlow {
  return new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });
}

function formatAddresses(list: { name?: string; email: string }[]): string {
  return list.map((a) => (a.name ? `"${a.name}" <${a.email}>` : a.email)).join(', ');
}

export async function sendEmail(
  email: string,
  password: string,
  message: OutgoingMessage,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<{ id?: string | null }> {
  const transport = makeTransport(email, password, config);
  const mailOptions: nodemailer.SendMailOptions = {
    from: message.fromEmail ? `${email} <${message.fromEmail}>` : email,
    to: formatAddresses(message.to),
    cc: message.cc ? formatAddresses(message.cc) : undefined,
    bcc: message.bcc ? formatAddresses(message.bcc) : undefined,
    subject: message.subject,
    html: message.message,
    attachments: (message.attachments ?? []).map((att) => ({
      filename: att.name,
      content: att.base64,
      encoding: 'base64',
      contentType: att.type,
    })),
    headers: message.headers,
  };
  const info = await transport.sendMail(mailOptions);
  return { id: info.messageId ?? null };
}

export async function sendDraft(
  email: string,
  password: string,
  draftId: string,
  message: OutgoingMessage,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<void> {
  const draft = await getDraft(email, password, draftId, config);
  const mergedMessage: OutgoingMessage = {
    ...(draft as unknown as OutgoingMessage),
    ...message,
  };
  await sendEmail(email, password, mergedMessage, config);
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    await client.mailboxOpen(config.folders.drafts);
    const uid = parseInt(draftId, 10);
    if (!isNaN(uid)) await client.messageDelete([uid], { uid: true });
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function createDraft(
  email: string,
  password: string,
  draft: DraftData,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<{ id?: string | null; success?: boolean; error?: string }> {
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    const transport = nodemailer.createTransport({ streamTransport: true, newline: 'unix' });
    const mailOptions: nodemailer.SendMailOptions = {
      from: email,
      to: draft.to ? formatAddresses(draft.to) : '',
      cc: draft.cc ? formatAddresses(draft.cc) : undefined,
      bcc: draft.bcc ? formatAddresses(draft.bcc) : undefined,
      subject: draft.subject ?? '',
      html: draft.message ?? '',
      attachments: (draft.attachments ?? []).map((att) => ({
        filename: att.name,
        content: att.base64,
        encoding: 'base64',
        contentType: att.type,
      })),
    };
    const info = await transport.sendMail(mailOptions);
    let rawMessage = '';
    await new Promise<void>((resolve, reject) => {
      const chunks: Buffer[] = [];
      (info.message as NodeJS.ReadableStream).on('data', (chunk: Buffer) => chunks.push(chunk));
      (info.message as NodeJS.ReadableStream).on('end', () => {
        rawMessage = Buffer.concat(chunks).toString();
        resolve();
      });
      (info.message as NodeJS.ReadableStream).on('error', reject);
    });
    const appendResult = await client.append(config.folders.drafts, rawMessage, ['\\Draft', '\\Seen']);
    return { id: String(appendResult?.uid ?? 'unknown'), success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function getDraft(
  email: string,
  password: string,
  draftId: string,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<{
  id: string;
  to?: string[];
  subject?: string;
  content?: string;
  cc?: string[];
  bcc?: string[];
  rawMessage?: { internalDate?: string | null };
}> {
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    await client.mailboxOpen(config.folders.drafts, { readOnly: true });
    const uid = parseInt(draftId, 10);
    if (isNaN(uid)) throw new Error(`Invalid draftId: ${draftId}`);
    for await (const msg of client.fetch(`${uid}`, { source: true, uid: true }, { uid: true })) {
      if (!msg.source) continue;
      const parsed = await simpleParser(Buffer.from(msg.source));
      return {
        id: draftId,
        to: parsed.to
          ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
              .flatMap((a) => ('value' in a ? a.value : [a]))
              .map((a: { address?: string }) => a.address ?? '')
              .filter(Boolean)
          : [],
        cc: parsed.cc
          ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc])
              .flatMap((a) => ('value' in a ? a.value : [a]))
              .map((a: { address?: string }) => a.address ?? '')
              .filter(Boolean)
          : [],
        bcc: [],
        subject: parsed.subject ?? '',
        content: parsed.html || parsed.text || '',
        rawMessage: { internalDate: parsed.date?.toISOString() ?? null },
      };
    }
    throw new Error(`Draft ${draftId} not found`);
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function listDrafts(
  email: string,
  password: string,
  params: { maxResults?: number; pageToken?: string },
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<{ threads: { id: string; historyId: string | null; $raw: unknown }[]; nextPageToken: string | null }> {
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(config.folders.drafts, { readOnly: true });
    const uidValidity = mailbox.uidValidity;
    if (mailbox.exists === 0) return { threads: [], nextPageToken: null };
    const startUid = params.pageToken ? parseInt(params.pageToken, 10) : 1;
    const maxResults = params.maxResults ?? 50;
    const threads: { id: string; historyId: string | null; $raw: unknown }[] = [];
    for await (const msg of client.fetch(`${startUid}:*`, { uid: true, envelope: true }, { uid: true })) {
      if (threads.length >= maxResults) break;
      threads.push({
        id: String(msg.uid),
        historyId: `${uidValidity}:${msg.uid}`,
        $raw: { uid: msg.uid, subject: msg.envelope?.subject },
      });
    }
    const nextPageToken =
      threads.length >= maxResults ? String(parseInt(threads[threads.length - 1].id, 10) + 1) : null;
    return { threads, nextPageToken };
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function deleteDraft(email: string, password: string, draftId: string, config: ImapProviderConfig = ICLOUD_CONFIG): Promise<void> {
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    await client.mailboxOpen(config.folders.drafts);
    const uid = parseInt(draftId, 10);
    if (isNaN(uid)) throw new Error(`Invalid draftId: ${draftId}`);
    await client.messageDelete([uid], { uid: true });
  } finally {
    await client.logout().catch(() => {});
  }
}
