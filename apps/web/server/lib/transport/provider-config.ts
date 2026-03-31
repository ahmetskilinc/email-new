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
