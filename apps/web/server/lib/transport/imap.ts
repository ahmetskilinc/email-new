// @ts-nocheck
import { type ImapProviderConfig, ICLOUD_CONFIG, buildLabelToFolder } from './provider-config';
import { simpleParser, type ParsedMail, type Attachment } from 'mailparser';
import { ImapFlow } from 'imapflow';

const SPECIAL_USE_TO_LABEL: Record<string, string> = {
  '\\Sent': 'SENT',
  '\\Drafts': 'DRAFT',
  '\\Trash': 'TRASH',
  '\\Junk': 'SPAM',
  '\\Flagged': 'STARRED',
  '\\Archive': 'ARCHIVE',
};

function makeClient(
  email: string,
  password: string,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): ImapFlow {
  return new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });
}

function getThreadRoot(references: string | undefined, messageId: string | undefined): string {
  if (references) {
    const refs = references.trim().split(/\s+/);
    if (refs.length > 0 && refs[0]) return refs[0].replace(/[<>]/g, '').trim();
  }
  return (messageId ?? '').replace(/[<>]/g, '').trim();
}

function encodeThreadId(rootMsgId: string): string {
  return Buffer.from(rootMsgId).toString('base64url');
}

function decodeThreadId(threadId: string): string {
  return Buffer.from(threadId, 'base64url').toString('utf-8');
}

function parseAddresses(addr: ParsedMail['from'] | ParsedMail['to'] | ParsedMail['cc']) {
  if (!addr) return [];
  const list =
    'value' in addr ? addr.value : (addr as { value: { name: string; address?: string }[] }).value;
  if (!Array.isArray(list)) return [];
  return list
    .map((a: { name: string; address?: string }) => ({
      name: a.name || undefined,
      email: a.address ?? '',
    }))
    .filter((a: { email: string }) => a.email);
}

function parsedMailToMessage(
  uid: number,
  threadId: string,
  parsed: ParsedMail,
  flags: Set<string>,
  folder: string,
): Record<string, unknown> {
  const from = parseAddresses(parsed.from);
  const to = parseAddresses(parsed.to as ParsedMail['from']);
  const cc = parseAddresses(parsed.cc as ParsedMail['from']);
  const isUnread = !flags.has('\\Seen');
  const isStarred = flags.has('\\Flagged');
  const isDraft = flags.has('\\Draft');
  const labels: { id: string; name: string }[] = [{ id: folder.toUpperCase(), name: folder }];
  if (isStarred) labels.push({ id: 'STARRED', name: 'Starred' });
  if (isDraft) labels.push({ id: 'DRAFT', name: 'Drafts' });
  const attachments = (parsed.attachments ?? []).map((att: Attachment, i: number) => ({
    attachmentId: `${uid}:${i}`,
    filename: att.filename ?? `attachment-${i}`,
    mimeType: att.contentType ?? 'application/octet-stream',
    size: att.size ?? att.content?.length ?? 0,
    body: att.content?.toString('base64') ?? '',
    headers: Object.entries(att.headers ?? {}).map(([name, value]) => ({
      name,
      value: String(value),
    })),
  }));
  const htmlBody = parsed.html || parsed.textAsHtml || '';
  const textBody = parsed.text || '';
  return {
    id: `${uid}`,
    threadId,
    title: parsed.subject ?? '(no subject)',
    subject: parsed.subject ?? '(no subject)',
    tags: [],
    sender: from[0] ?? { email: '' },
    to,
    cc: cc.length ? cc : null,
    bcc: null,
    tls: false,
    listUnsubscribe: parsed.headers.get('list-unsubscribe') ?? undefined,
    listUnsubscribePost: parsed.headers.get('list-unsubscribe-post') ?? undefined,
    receivedOn: (parsed.date ?? new Date()).toISOString(),
    unread: isUnread,
    body: htmlBody || textBody,
    processedHtml: htmlBody,
    blobUrl: '',
    decodedBody: htmlBody || textBody,
    references: parsed.references
      ? Array.isArray(parsed.references)
        ? parsed.references.join(' ')
        : parsed.references
      : undefined,
    inReplyTo: parsed.inReplyTo ?? undefined,
    replyTo: parsed.replyTo
      ? parseAddresses(parsed.replyTo as ParsedMail['from'])[0]?.email
      : undefined,
    messageId: parsed.messageId ?? undefined,
    attachments,
    isDraft,
    labels,
  };
}

export async function validateCredentials(
  email: string,
  password: string,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<{ email: string; name: string }> {
  const client = makeClient(email, password, config);
  await client.connect();
  await client.logout();
  const name = email.split('@')[0] ?? email;
  return { email, name };
}

export async function listThreads(
  email: string,
  password: string,
  params: { folder: string; query?: string; maxResults: number; pageToken: string | null },
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<{
  threads: { id: string; historyId: string | null; $raw?: unknown }[];
  nextPageToken: string | null;
}> {
  const labelToFolder = buildLabelToFolder(config);
  const folderName = labelToFolder[params.folder.toUpperCase()] ?? params.folder;
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(folderName, { readOnly: true });
    const uidValidity = mailbox.uidValidity;
    if (mailbox.exists === 0) {
      return { threads: [], nextPageToken: null };
    }

    const fetchCount = params.maxResults * 3;
    const totalMessages = mailbox.exists;

    // Use sequence numbers (1..exists, always contiguous) rather than UIDs (which have gaps).
    // pageToken = the sequence number below which to fetch next page (exclusive upper bound).
    let seqEnd: number;
    if (params.pageToken) {
      seqEnd = parseInt(params.pageToken, 10) - 1;
      if (seqEnd < 1) return { threads: [], nextPageToken: null };
    } else {
      seqEnd = totalMessages;
    }
    const seqStart = Math.max(1, seqEnd - fetchCount + 1);
    const fetchRange = `${seqStart}:${seqEnd}`;

    const messages: {
      uid: number;
      seq: number;
      messageId?: string;
      references?: string;
      date?: Date;
      flags: Set<string>;
      subject?: string;
      from?: { name?: string; address?: string };
    }[] = [];
    // No { uid: true } in third arg = sequence-number range; uid: true in query = return the UID value
    for await (const msg of client.fetch(fetchRange, {
      uid: true,
      flags: true,
      envelope: true,
      headers: ['message-id', 'references', 'in-reply-to'],
    })) {
      const headerMessageId = msg.headers
        ? (() => {
            const parsed = Buffer.from(msg.headers).toString();
            const match = parsed.match(/^message-id:\s*(.+)$/im);
            return match?.[1]?.trim();
          })()
        : undefined;
      const headerReferences = msg.headers
        ? (() => {
            const parsed = Buffer.from(msg.headers).toString();
            const match = parsed.match(/^references:\s*([\s\S]*?)(?=^\S|\z)/im);
            return match?.[1]?.replace(/\s+/g, ' ').trim();
          })()
        : undefined;
      messages.push({
        uid: msg.uid,
        seq: msg.seq,
        messageId: headerMessageId ?? msg.envelope?.messageId,
        references: headerReferences,
        date: msg.envelope?.date ?? undefined,
        flags: msg.flags ?? new Set(),
        subject: msg.envelope?.subject ?? undefined,
        from: msg.envelope?.from?.[0] ?? undefined,
      });
    }
    messages.sort((a, b) => {
      const da = a.date?.getTime() ?? 0;
      const db = b.date?.getTime() ?? 0;
      return db - da || b.uid - a.uid;
    });
    const threadMap = new Map<string, typeof messages>();
    for (const msg of messages) {
      const rootMsgId = getThreadRoot(msg.references, msg.messageId);
      if (!threadMap.has(rootMsgId)) threadMap.set(rootMsgId, []);
      threadMap.get(rootMsgId)!.push(msg);
    }
    const threadEntries = Array.from(threadMap.entries()).slice(0, params.maxResults);
    const threads = threadEntries.map(([rootMsgId, msgs]) => {
      const latestMsg = msgs[0]!;
      const isUnread = !latestMsg.flags.has('\\Seen');
      return {
        id: encodeThreadId(rootMsgId),
        historyId: `${uidValidity}:${latestMsg.uid}`,
        $raw: {
          uids: msgs.map((m) => m.uid),
          preview: {
            sender: { name: latestMsg.from?.name ?? '', email: latestMsg.from?.address ?? '' },
            subject: latestMsg.subject ?? '(no subject)',
            receivedOn: latestMsg.date?.toISOString() ?? new Date().toISOString(),
            unread: isUnread,
            totalReplies: msgs.filter((m) => !m.flags.has('\\Draft')).length,
          },
        },
      };
    });
    // nextPageToken = seqStart means "fetch messages with seq < seqStart next time"
    const nextPageToken =
      seqStart > 1 && threads.length >= params.maxResults ? String(seqStart) : null;
    return { threads, nextPageToken };
  } catch (err) {
    throw err;
  } finally {
    await client.logout().catch(() => {});
  }
}

async function fetchMessageByUid(client: ImapFlow, uid: number, threadId: string, folder: string) {
  for await (const msg of client.fetch(
    `${uid}`,
    { source: true, flags: true, uid: true },
    { uid: true },
  )) {
    if (!msg.source) continue;
    const parsed = await simpleParser(Buffer.from(msg.source));
    return parsedMailToMessage(msg.uid, threadId, parsed, msg.flags ?? new Set(), folder);
  }
  return null;
}

export async function getThread(
  email: string,
  password: string,
  threadId: string,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<{
  messages: Record<string, unknown>[];
  latest?: Record<string, unknown>;
  hasUnread: boolean;
  totalReplies: number;
  labels: { id: string; name: string }[];
  isLatestDraft?: boolean;
}> {
  const rootMsgId = decodeThreadId(threadId);
  const client = makeClient(email, password, config);

  const scanFolder = async (folder: string): Promise<Record<string, unknown>[]> => {
    try {
      const mailbox = await client.mailboxOpen(folder, { readOnly: true });
      if (!mailbox.exists || mailbox.exists === 0) return [];

      const matchingUids: number[] = [];

      for await (const msg of client.fetch('1:*', {
        uid: true,
        envelope: true,
        headers: ['message-id', 'references', 'in-reply-to'],
      })) {
        const headerMessageId = msg.headers
          ? (() => {
              const parsed = Buffer.from(msg.headers).toString();
              const match = parsed.match(/^message-id:\s*(.+)$/im);
              return match?.[1]?.trim();
            })()
          : undefined;
        const headerReferences = msg.headers
          ? (() => {
              const parsed = Buffer.from(msg.headers).toString();
              const match = parsed.match(/^references:\s*([\s\S]*?)(?=^\S|\z)/im);
              return match?.[1]?.replace(/\s+/g, ' ').trim();
            })()
          : undefined;

        const messageId = headerMessageId ?? msg.envelope?.messageId;
        const msgRoot = getThreadRoot(headerReferences, messageId);

        if (msgRoot === rootMsgId) {
          matchingUids.push(msg.uid);
        }
      }

      const msgs: Record<string, unknown>[] = [];
      for (const uid of matchingUids) {
        const msg = await fetchMessageByUid(client, uid, threadId, folder);
        if (msg) msgs.push(msg);
      }
      return msgs;
    } catch (err) {
      console.error(`[imap:getThread] scanFolder ${folder} error`, err);
      return [];
    }
  };

  try {
    await client.connect();
    const allMessages: Record<string, unknown>[] = [];
    let foundFolder = 'INBOX';

    const inboxMsgs = await scanFolder(config.folders.inbox);
    if (inboxMsgs.length > 0) {
      allMessages.push(...inboxMsgs);
      foundFolder = config.folders.inbox;
      const sentMsgs = await scanFolder(config.folders.sent);
      allMessages.push(...sentMsgs);
    } else {
      for (const folder of [
        config.folders.sent,
        config.folders.drafts,
        config.folders.trash,
        config.folders.spam,
      ]) {
        const msgs = await scanFolder(folder);
        if (msgs.length > 0) {
          allMessages.push(...msgs);
          if (allMessages.length === msgs.length) foundFolder = folder;
        }
      }
    }
    allMessages.sort(
      (a, b) =>
        new Date(a['receivedOn'] as string).getTime() -
        new Date(b['receivedOn'] as string).getTime(),
    );
    const hasUnread = allMessages.some((m) => m['unread'] === true);
    const nonDrafts = allMessages.filter((m) => !m['isDraft']);
    const latest = allMessages[allMessages.length - 1];

    return {
      messages: allMessages,
      latest,
      hasUnread,
      totalReplies: nonDrafts.length,
      labels: [{ id: foundFolder.toUpperCase(), name: foundFolder }],
      isLatestDraft: latest?.['isDraft'] === true,
    };
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function deleteMessages(
  email: string,
  password: string,
  threadId: string,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<void> {
  const rootMsgId = decodeThreadId(threadId);
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    await client.mailboxOpen(config.folders.inbox);
    const searchUids = await client.search(
      { header: ['Message-ID', `<${rootMsgId}>`] },
      { uid: true },
    );
    const refsUids = await client.search({ header: ['References', rootMsgId] }, { uid: true });
    const uids = [...new Set([...searchUids, ...refsUids])];
    if (uids.length > 0) await client.messageMove(uids, config.folders.trash, { uid: true });
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function markMessages(
  email: string,
  password: string,
  threadIds: string[],
  read: boolean,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<void> {
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    for (const folder of [config.folders.inbox, config.folders.sent, config.folders.drafts]) {
      try {
        await client.mailboxOpen(folder);
        for (const threadId of threadIds) {
          const rootMsgId = decodeThreadId(threadId);
          const searchUids = await client.search(
            { header: ['Message-ID', `<${rootMsgId}>`] },
            { uid: true },
          );
          const refsUids = await client.search(
            { header: ['References', rootMsgId] },
            { uid: true },
          );
          const uids = [...new Set([...searchUids, ...refsUids])];
          if (uids.length === 0) continue;
          if (read) await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
          else await client.messageFlagsRemove(uids, ['\\Seen'], { uid: true });
        }
      } catch {}
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function modifyLabels(
  email: string,
  password: string,
  threadIds: string[],
  addLabels: string[],
  removeLabels: string[],
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<void> {
  const labelToFolder = buildLabelToFolder(config);
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    for (const threadId of threadIds) {
      const rootMsgId = decodeThreadId(threadId);
      const addFlags: string[] = [];
      const removeFlags: string[] = [];
      const moveToFolder = addLabels.find((l) => labelToFolder[l.toUpperCase()]);
      const removeFromLabel = removeLabels.find((l) => labelToFolder[l.toUpperCase()]);
      if (addLabels.includes('STARRED') || addLabels.includes('IMPORTANT'))
        addFlags.push('\\Flagged');
      if (removeLabels.includes('STARRED') || removeLabels.includes('IMPORTANT'))
        removeFlags.push('\\Flagged');
      const sourceFolders = [
        config.folders.inbox,
        config.folders.sent,
        config.folders.drafts,
        config.folders.trash,
        config.folders.spam,
        config.folders.archive,
      ];
      for (const folder of sourceFolders) {
        try {
          await client.mailboxOpen(folder);
          const searchUids = await client.search(
            { header: ['Message-ID', `<${rootMsgId}>`] },
            { uid: true },
          );
          const refsUids = await client.search(
            { header: ['References', rootMsgId] },
            { uid: true },
          );
          const uids = [...new Set([...searchUids, ...refsUids])];
          if (uids.length === 0) continue;
          if (addFlags.length) await client.messageFlagsAdd(uids, addFlags, { uid: true });
          if (removeFlags.length) await client.messageFlagsRemove(uids, removeFlags, { uid: true });
          if (moveToFolder) {
            const targetFolder = labelToFolder[moveToFolder.toUpperCase()];
            if (targetFolder && targetFolder !== folder)
              await client.messageMove(uids, targetFolder, { uid: true });
          }
          if (removeFromLabel === 'INBOX' && !moveToFolder)
            await client.messageMove(uids, config.folders.archive, { uid: true });
        } catch {}
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function listFolders(
  email: string,
  password: string,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<{ id: string; name: string; type: string }[]> {
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    const mailboxes = await client.list();
    return mailboxes.map((mb) => {
      let labelId = mb.path.toUpperCase();
      for (const [attr, id] of Object.entries(SPECIAL_USE_TO_LABEL)) {
        if (mb.specialUse === attr || (mb.flags && mb.flags.has(attr))) {
          labelId = id;
          break;
        }
      }
      if (mb.specialUse === '\\Inbox' || mb.path.toLowerCase() === 'inbox') labelId = 'INBOX';
      return { id: labelId, name: mb.name, type: labelId === 'INBOX' ? 'system' : 'user' };
    });
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function countUnread(
  email: string,
  password: string,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<{ count?: number; label?: string }[]> {
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    const counts: { count?: number; label?: string }[] = [];
    const folders = [
      { folder: config.folders.inbox, label: 'INBOX' },
      { folder: config.folders.drafts, label: 'DRAFT' },
      { folder: config.folders.sent, label: 'SENT' },
    ];
    for (const { folder, label } of folders) {
      try {
        const mb = await client.mailboxOpen(folder, { readOnly: true });
        counts.push({ label, count: mb.unseen ?? 0 });
      } catch {
        counts.push({ label, count: 0 });
      }
    }
    return counts;
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function getRawEmail(
  email: string,
  password: string,
  messageId: string,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<string> {
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    await client.mailboxOpen(config.folders.inbox, { readOnly: true });
    const uid = parseInt(messageId, 10);
    if (isNaN(uid)) throw new Error('Invalid messageId');
    let rawEmail = '';
    for await (const msg of client.fetch(`${uid}`, { source: true }, { uid: true })) {
      if (msg.source) rawEmail = Buffer.from(msg.source).toString();
    }
    return rawEmail;
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function getAttachment(
  email: string,
  password: string,
  messageId: string,
  attachmentId: string,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<string> {
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    await client.mailboxOpen(config.folders.inbox, { readOnly: true });
    const uid = parseInt(messageId, 10);
    const partIndex = parseInt(attachmentId.split(':')[1] ?? '0', 10);
    for await (const msg of client.fetch(`${uid}`, { source: true }, { uid: true })) {
      if (!msg.source) continue;
      const parsed = await simpleParser(Buffer.from(msg.source));
      const att = parsed.attachments?.[partIndex];
      if (att?.content) return att.content.toString('base64');
    }
    return '';
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function getMessageAttachments(
  email: string,
  password: string,
  messageId: string,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<
  {
    filename: string;
    mimeType: string;
    size: number;
    attachmentId: string;
    headers: { name: string; value: string }[];
    body: string;
  }[]
> {
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    await client.mailboxOpen(config.folders.inbox, { readOnly: true });
    const uid = parseInt(messageId, 10);
    for await (const msg of client.fetch(`${uid}`, { source: true }, { uid: true })) {
      if (!msg.source) continue;
      const parsed = await simpleParser(Buffer.from(msg.source));
      return (parsed.attachments ?? []).map((att: Attachment, i: number) => ({
        attachmentId: `${uid}:${i}`,
        filename: att.filename ?? `attachment-${i}`,
        mimeType: att.contentType ?? 'application/octet-stream',
        size: att.size ?? att.content?.length ?? 0,
        body: att.content?.toString('base64') ?? '',
        headers: Object.entries(att.headers ?? {}).map(([name, value]) => ({
          name,
          value: String(value),
        })),
      }));
    }
    return [];
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function getAliases(
  email: string,
): Promise<{ email: string; name?: string; primary?: boolean }[]> {
  return [{ email, primary: true }];
}

export async function listHistory(
  email: string,
  password: string,
  historyId: string,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<{ history: unknown[]; historyId: string }> {
  const parts = historyId.split(':');
  const lastUid = parseInt(parts[1] ?? '0', 10);
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(config.folders.inbox, { readOnly: true });
    const uidValidity = mailbox.uidValidity;
    const newUids = await client.search({ uid: `${lastUid + 1}:*` }, { uid: true });
    const history = newUids.map((uid) => ({ uid, type: 'new' }));
    const latestUid = newUids.length > 0 ? Math.max(...newUids) : lastUid;
    return { history, historyId: `${uidValidity}:${latestUid}` };
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function deleteAllSpam(
  email: string,
  password: string,
  config: ImapProviderConfig = ICLOUD_CONFIG,
): Promise<{ success: boolean; message: string; count?: number }> {
  const client = makeClient(email, password, config);
  try {
    await client.connect();
    await client.mailboxOpen(config.folders.spam);
    const allUids = await client.search({ all: true }, { uid: true });
    if (allUids.length === 0)
      return { success: true, message: 'Junk folder is already empty', count: 0 };
    await client.messageDelete(allUids, { uid: true });
    return {
      success: true,
      message: `Deleted ${allUids.length} junk messages`,
      count: allUids.length,
    };
  } catch (e) {
    return { success: false, message: String(e) };
  } finally {
    await client.logout().catch(() => {});
  }
}
