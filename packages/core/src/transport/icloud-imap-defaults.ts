export const ICLOUD_IMAP_DEFAULTS = {
  imapHost: "imap.mail.me.com",
  imapPort: 993,
  smtpHost: "smtp.mail.me.com",
  smtpPort: 587,
  smtpSecure: true,
  smtpRequireTLS: true,
  folders: {
    inbox: "INBOX",
    sent: "Sent Messages",
    drafts: "Drafts",
    trash: "Deleted Messages",
    spam: "Junk",
    archive: "Archive",
  },
}
