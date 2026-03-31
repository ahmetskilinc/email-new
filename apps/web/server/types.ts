import { z } from "zod"

export enum EProviders {
  "google" = "google",
  "microsoft" = "microsoft",
  "icloud" = "icloud",
  "yahoo" = "yahoo",
}

export type Label = {
  id: string
  name: string
  color?: {
    backgroundColor: string
    textColor: string
  }
  type: string
  labels?: Label[]
  count?: number
}

export interface Sender {
  name?: string
  email: string
}

export const ParsedMessageSchema = z.object({
  id: z.string(),
  connectionId: z.string().optional(),
  title: z.string(),
  subject: z.string(),
  tags: z.array(
    z.object({ id: z.string(), name: z.string(), type: z.string() }),
  ),
  sender: z.object({ name: z.string().optional(), email: z.string() }),
  to: z.array(z.object({ name: z.string().optional(), email: z.string() })),
  cc: z
    .array(z.object({ name: z.string().optional(), email: z.string() }))
    .nullable(),
  bcc: z
    .array(z.object({ name: z.string().optional(), email: z.string() }))
    .nullable(),
  tls: z.boolean(),
  listUnsubscribe: z.string().optional(),
  listUnsubscribePost: z.string().optional(),
  receivedOn: z.string(),
  unread: z.boolean(),
  body: z.string(),
  processedHtml: z.string(),
  blobUrl: z.string(),
  decodedBody: z.string().optional(),
  references: z.string().optional(),
  inReplyTo: z.string().optional(),
  replyTo: z.string().optional(),
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  attachments: z
    .array(
      z.object({
        attachmentId: z.string(),
        filename: z.string(),
        mimeType: z.string(),
        size: z.number(),
        body: z.string(),
        headers: z.array(
          z.object({
            name: z.string().nullable(),
            value: z.string().nullable(),
          }),
        ),
      }),
    )
    .optional(),
  isDraft: z.boolean().optional(),
})

export type ParsedMessage = z.infer<typeof ParsedMessageSchema>

export interface IOutgoingMessage {
  to: Sender[]
  cc?: Sender[]
  bcc?: Sender[]
  subject: string
  message: string
  attachments: {
    name: string
    type: string
    size: number
    lastModified: number
    base64: string
  }[]
  headers: Record<string, string>
  threadId?: string
  fromEmail?: string
  isForward?: boolean
  originalMessage?: string | null
}

export interface DeleteAllSpamResponse {
  success: boolean
  message: string
  count?: number
  error?: string
}
