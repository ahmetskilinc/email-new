// @ts-nocheck
export interface ImapProviderConfig {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpRequireTLS: boolean;
  folders: {
    inbox: string;
    sent: string;
    drafts: string;
    trash: string;
    spam: string;
    archive: string;
  };
}

export const ICLOUD_CONFIG: ImapProviderConfig = {
  imapHost: 'imap.mail.me.com',
  imapPort: 993,
  smtpHost: 'smtp.mail.me.com',
  smtpPort: 587,
  smtpSecure: false,
  smtpRequireTLS: true,
  folders: {
    inbox: 'INBOX',
    sent: 'Sent Messages',
    drafts: 'Drafts',
    trash: 'Deleted Messages',
    spam: 'Junk',
    archive: 'Archive',
  },
};

export const YAHOO_CONFIG: ImapProviderConfig = {
  imapHost: 'imap.mail.yahoo.com',
  imapPort: 993,
  smtpHost: 'smtp.mail.yahoo.com',
  smtpPort: 587,
  smtpSecure: false,
  smtpRequireTLS: true,
  folders: {
    inbox: 'INBOX',
    sent: 'Sent',
    drafts: 'Draft',
    trash: 'Trash',
    spam: 'Bulk Mail',
    archive: 'Archive',
  },
};

export const DEFAULT_CUSTOM_FOLDERS: ImapProviderConfig['folders'] = {
  inbox: 'INBOX',
  sent: 'Sent',
  drafts: 'Drafts',
  trash: 'Trash',
  spam: 'Junk',
  archive: 'Archive',
};

export function buildLabelToFolder(config: ImapProviderConfig): Record<string, string> {
  return {
    INBOX: config.folders.inbox,
    SENT: config.folders.sent,
    DRAFT: config.folders.drafts,
    TRASH: config.folders.trash,
    SPAM: config.folders.spam,
    STARRED: config.folders.inbox,
    ARCHIVE: config.folders.archive,
  };
}

function matchFolderByName(
  mailboxes: { path: string; name: string }[],
  candidates: string[],
): string | undefined {
  const lowered = candidates.map((c) => c.toLowerCase());
  for (const mb of mailboxes) {
    if (lowered.includes(mb.path.toLowerCase()) || lowered.includes(mb.name.toLowerCase())) {
      return mb.path;
    }
  }
  return undefined;
}

export async function autoDiscoverFolders(
  email: string,
  password: string,
  imapHost: string,
  imapPort: number,
): Promise<ImapProviderConfig['folders']> {
  const { ImapFlow } = await import('imapflow');
  const client = new ImapFlow({
    host: imapHost,
    port: imapPort,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });

  try {
    await client.connect();
    const mailboxes = await client.list();

    const folders: Partial<ImapProviderConfig['folders']> = {
      inbox: 'INBOX',
    };

    for (const mb of mailboxes) {
      if (mb.specialUse === '\\Inbox' || mb.path.toLowerCase() === 'inbox') {
        folders.inbox = mb.path;
      } else if (mb.specialUse === '\\Sent') {
        folders.sent = mb.path;
      } else if (mb.specialUse === '\\Drafts') {
        folders.drafts = mb.path;
      } else if (mb.specialUse === '\\Trash') {
        folders.trash = mb.path;
      } else if (mb.specialUse === '\\Junk') {
        folders.spam = mb.path;
      } else if (mb.specialUse === '\\Archive') {
        folders.archive = mb.path;
      }
    }

    if (!folders.sent) {
      folders.sent =
        matchFolderByName(mailboxes, ['Sent', 'Sent Messages', 'Sent Items', 'INBOX.Sent']) ??
        'Sent';
    }
    if (!folders.drafts) {
      folders.drafts =
        matchFolderByName(mailboxes, ['Drafts', 'Draft', 'INBOX.Drafts']) ?? 'Drafts';
    }
    if (!folders.trash) {
      folders.trash =
        matchFolderByName(mailboxes, [
          'Trash',
          'Deleted Messages',
          'Deleted Items',
          'INBOX.Trash',
        ]) ?? 'Trash';
    }
    if (!folders.spam) {
      folders.spam =
        matchFolderByName(mailboxes, [
          'Junk',
          'Spam',
          'Bulk Mail',
          'Junk E-mail',
          'INBOX.Junk',
          'INBOX.Spam',
        ]) ?? 'Junk';
    }
    if (!folders.archive) {
      folders.archive =
        matchFolderByName(mailboxes, ['Archive', 'All Mail', 'INBOX.Archive']) ?? 'Archive';
    }

    return folders as ImapProviderConfig['folders'];
  } finally {
    await client.logout().catch(() => {});
  }
}
