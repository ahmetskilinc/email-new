/** Normalized shapes the rest of the provider works with. */

export type ICloudFolder = {
  /** Apple's folder GUID — the identifier every message call takes. */
  guid: string
  name: string
  /** Well-known role, when Apple marks one. */
  role?: "inbox" | "sent" | "drafts" | "trash" | "junk" | "archive"
  unreadCount?: number
  totalCount?: number
  parentGuid?: string
}

export type ICloudAddress = {
  name?: string
  email: string
}

export type ICloudMessageSummary = {
  guid: string
  folderGuid?: string
  /** Apple's conversation identifier, when the payload carries one. */
  conversationId?: string
  /** RFC822 Message-ID header, used for threading when Apple gives us none. */
  messageId?: string
  references?: string
  inReplyTo?: string
  subject: string
  from?: ICloudAddress
  to: ICloudAddress[]
  cc: ICloudAddress[]
  bcc: ICloudAddress[]
  replyTo?: string
  /** ISO-8601. */
  date: string
  unread: boolean
  flagged: boolean
  draft: boolean
  hasAttachments: boolean
  snippet?: string
  size?: number
}

export type ICloudAttachment = {
  attachmentId: string
  filename: string
  mimeType: string
  size: number
  /** base64, populated only when the attachment body was requested. */
  body: string
  isInline?: boolean
}

export type ICloudMessageDetail = ICloudMessageSummary & {
  html?: string
  text?: string
  attachments: ICloudAttachment[]
  listUnsubscribe?: string
  listUnsubscribePost?: string
  headers?: Record<string, string>
}

export type ICloudMessagePage = {
  messages: ICloudMessageSummary[]
  /** Opaque cursor for the next page; null when the folder is exhausted. */
  nextCursor: string | null
}
