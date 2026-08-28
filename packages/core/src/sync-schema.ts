import {
  defineModel,
  defineSchema,
  p,
  type InferRecord,
} from "@ahmetskilinc/sync-core"

/**
 * The sync contract between the mail server and every client. Both halves
 * import from here: the server's bridge/adapter/validators and the client's
 * local-first store. Every model carries a server-stamped `userId` — the
 * partition key — which clients never write (enforced in the server's
 * validateTransaction; MailOp creates carry it but must match the
 * authenticated context).
 */

export type Participant = { name?: string | null; email: string }

/**
 * The inbox list row, normalized — no provider `$raw` ever reaches a client.
 * id = `${connectionId}:${providerThreadId}` (see @workspace/core/ids).
 * Partial: clients hold a bounded recent window per connection, not the
 * whole mailbox; folder membership is expressed through `labels`
 * ("INBOX", "TRASH", …), so archive/delete are label patches.
 */
export const ThreadPreview = defineModel(
  "ThreadPreview",
  {
    userId: p.string(),
    connectionId: p.string(),
    providerThreadId: p.string(),
    subject: p.string().nullable(),
    snippet: p.string().nullable(),
    sender: p.json<Participant>(),
    participants: p.json<Participant[]>().nullable(),
    labels: p.json<string[]>(),
    unread: p.boolean(),
    starred: p.boolean(),
    hasAttachments: p.boolean().nullable(),
    messageCount: p.number(),
    /** ISO-8601; the sort key. Coalesced server-side, never empty. */
    lastMessageAt: p.date(),
  },
  { partial: true }
)

/**
 * Message envelope (Phase F — full-mailbox sync). Never bootstrapped; pulled
 * per opened thread. Bodies stay out of sync records entirely: `bodyRef`
 * keys an on-demand fetch.
 */
export const Message = defineModel(
  "Message",
  {
    userId: p.string(),
    connectionId: p.string(),
    threadId: p.reference(() => ThreadPreview),
    providerMessageId: p.string(),
    providerThreadId: p.string(),
    from: p.json<Participant>().nullable(),
    to: p.json<Participant[]>().nullable(),
    cc: p.json<Participant[]>().nullable(),
    subject: p.string().nullable(),
    snippet: p.string().nullable(),
    unread: p.boolean(),
    starred: p.boolean(),
    hasAttachments: p.boolean().nullable(),
    receivedAt: p.date().nullable(),
    bodyRef: p.string().nullable(),
  },
  { partial: true }
)

/** id = `${connectionId}:${providerLabelId}`. */
export const Label = defineModel("Label", {
  userId: p.string(),
  connectionId: p.string(),
  providerLabelId: p.string(),
  name: p.string(),
  /** "system" | "user" */
  type: p.string(),
  color: p.json<{ backgroundColor: string; textColor: string }>().nullable(),
  count: p.number().nullable(),
})

/**
 * SANITIZED connection projection — exactly what listConnections returns.
 * Tokens never leave the encrypted Postgres columns. id = connection.id.
 */
export const Connection = defineModel("Connection", {
  userId: p.string(),
  email: p.string(),
  name: p.string().nullable(),
  picture: p.string().nullable(),
  providerId: p.string(),
  createdAt: p.date(),
  /** "active" | "reauth_required" — drives the reconnect banner. */
  status: p.string(),
})

/** id = userId. Read-only on clients (writes go through server actions). */
export const Settings = defineModel("Settings", {
  userId: p.string(),
  settings: p.json<Record<string, unknown>>(),
})

/** id = userId. The non-secret identity snapshot for instant shell paint. */
export const UserProfile = defineModel("UserProfile", {
  userId: p.string(),
  email: p.string(),
  name: p.string().nullable(),
  image: p.string().nullable(),
  defaultConnectionId: p.string().nullable(),
})

/** id = connectionId. Projection of syncState → the "syncing…" banner. */
export const ConnectionSyncStatus = defineModel("ConnectionSyncStatus", {
  userId: p.string(),
  connectionId: p.string(),
  backfillComplete: p.boolean(),
  syncedThreadCount: p.number(),
  lastSyncAt: p.date().nullable(),
  lastError: p.string().nullable(),
})

export type MailOpKind =
  | "archive"
  | "delete"
  | "markRead"
  | "markUnread"
  | "star"
  | "unstar"
  | "modifyLabels"

/**
 * The durable mutation outbox: user actions are DATA. A client transact
 * pairs the optimistic ThreadPreview patch with a MailOp create; the
 * provider-ops workflow claims pending ops, performs the real driver calls,
 * and publishes done/failed back through the bridge — so provider failures
 * reconcile every client, and offline queues survive restarts. Stateless by
 * design: explicit add/remove label sets, no pre-image reconstruction.
 */
export const MailOp = defineModel("MailOp", {
  userId: p.string(),
  connectionId: p.string(),
  /** Provider thread ids (NOT record ids). */
  threadIds: p.json<string[]>(),
  op: p.json<MailOpKind>(),
  addLabels: p.json<string[]>().nullable(),
  removeLabels: p.json<string[]>().nullable(),
  /** "pending" | "done" | "failed" — only the server moves it off pending. */
  status: p.string(),
  attempts: p.number(),
  error: p.string().nullable(),
  createdAt: p.date(),
})

export const syncSchema = defineSchema([
  ThreadPreview,
  Message,
  Label,
  Connection,
  Settings,
  UserProfile,
  ConnectionSyncStatus,
  MailOp,
])

/** Paint-critical first: the shell renders before the thread window lands. */
export const BOOTSTRAP_ORDER = [
  UserProfile.name,
  Settings.name,
  Connection.name,
  ConnectionSyncStatus.name,
  Label.name,
  ThreadPreview.name,
]

/** Models clients may write, and which properties (everything else rejects). */
export const CLIENT_WRITABLE = {
  [ThreadPreview.name]: {
    operations: ["update"] as const,
    properties: ["unread", "starred", "labels"] as const,
  },
  [MailOp.name]: {
    operations: ["create"] as const,
    properties: [
      "userId",
      "connectionId",
      "threadIds",
      "op",
      "addLabels",
      "removeLabels",
      "status",
      "attempts",
      "error",
      "createdAt",
    ] as const,
  },
} as const

export type ThreadPreviewRecord = InferRecord<typeof ThreadPreview>
export type MessageRecord = InferRecord<typeof Message>
export type LabelRecord = InferRecord<typeof Label>
export type ConnectionRecord = InferRecord<typeof Connection>
export type SettingsRecord = InferRecord<typeof Settings>
export type UserProfileRecord = InferRecord<typeof UserProfile>
export type ConnectionSyncStatusRecord = InferRecord<typeof ConnectionSyncStatus>
export type MailOpRecord = InferRecord<typeof MailOp>
