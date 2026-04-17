import {
  pgTableCreator,
  text,
  timestamp,
  boolean,
  jsonb,
  unique,
  index,
  integer,
} from "drizzle-orm/pg-core"
import { defaultUserSettings } from "../lib/schemas"

export const createTable = pgTableCreator((name) => `zeitmail_${name}`)

export const user = createTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  defaultConnectionId: text("default_connection_id"),
  customPrompt: text("custom_prompt"),
  phoneNumber: text("phone_number").unique(),
  phoneNumberVerified: boolean("phone_number_verified"),
})

export const session = createTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("session_user_id_idx").on(t.userId),
    index("session_expires_at_idx").on(t.expiresAt),
  ],
)

export const account = createTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    index("account_user_id_idx").on(t.userId),
    index("account_provider_user_id_idx").on(t.providerId, t.userId),
  ],
)

export const verification = createTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (t) => [
    index("verification_identifier_idx").on(t.identifier),
    index("verification_expires_at_idx").on(t.expiresAt),
  ],
)

export const connection = createTable(
  "connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    picture: text("picture"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    scope: text("scope").notNull(),
    providerId: text("provider_id")
      .$type<"google" | "microsoft" | "icloud" | "yahoo" | "custom">()
      .notNull(),
    imapConfig: jsonb("imap_config"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    unique().on(t.userId, t.email),
    index("connection_user_id_idx").on(t.userId),
    index("connection_provider_id_idx").on(t.providerId),
  ],
)

export const signature = createTable(
  "signature",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connection.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    body: text("body").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    index("signature_connection_id_idx").on(t.connectionId),
    index("signature_user_id_idx").on(t.userId),
  ],
)

export const userSettings = createTable("user_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(),
  settings: jsonb("settings")
    .$type<typeof defaultUserSettings>()
    .notNull()
    .default(defaultUserSettings),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const recipient = createTable(
  "recipient",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    frequency: integer("frequency").notNull().default(1),
    lastUsed: timestamp("last_used").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (t) => [
    unique().on(t.userId, t.email),
    index("recipient_user_id_idx").on(t.userId),
  ],
)

export const emailThread = createTable(
  "email_thread",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connection.id, { onDelete: "cascade" }),
    providerThreadId: text("provider_thread_id").notNull(),
    subject: text("subject"),
    snippet: text("snippet"),
    participants: jsonb("participants").$type<
      { name?: string | null; email: string }[]
    >(),
    labels: jsonb("labels").$type<string[]>(),
    messageCount: integer("message_count").notNull().default(0),
    hasUnread: boolean("has_unread").notNull().default(false),
    lastMessageAt: timestamp("last_message_at"),
    historyId: text("history_id"),
    syncedAt: timestamp("synced_at").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (t) => [
    unique().on(t.connectionId, t.providerThreadId),
    index("email_thread_connection_id_idx").on(t.connectionId),
    index("email_thread_last_message_at_idx").on(
      t.connectionId,
      t.lastMessageAt,
    ),
  ],
)

export const emailMessage = createTable(
  "email_message",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => connection.id, { onDelete: "cascade" }),
    threadId: text("thread_id").references(() => emailThread.id, {
      onDelete: "cascade",
    }),
    providerMessageId: text("provider_message_id").notNull(),
    providerThreadId: text("provider_thread_id").notNull(),
    folder: text("folder"),
    fromName: text("from_name"),
    fromEmail: text("from_email"),
    toRecipients: jsonb("to_recipients").$type<
      { name?: string | null; email: string }[]
    >(),
    ccRecipients: jsonb("cc_recipients").$type<
      { name?: string | null; email: string }[]
    >(),
    subject: text("subject"),
    snippet: text("snippet"),
    bodyRef: text("body_ref"),
    labels: jsonb("labels").$type<string[]>(),
    flags: jsonb("flags").$type<{
      unread?: boolean
      starred?: boolean
      important?: boolean
      hasAttachments?: boolean
    }>(),
    receivedAt: timestamp("received_at"),
    headers: jsonb("headers").$type<Record<string, string>>(),
    syncedAt: timestamp("synced_at").notNull(),
  },
  (t) => [
    unique().on(t.connectionId, t.providerMessageId),
    index("email_message_connection_folder_received_idx").on(
      t.connectionId,
      t.folder,
      t.receivedAt,
    ),
    index("email_message_thread_idx").on(t.threadId),
  ],
)

export const syncState = createTable("sync_state", {
  connectionId: text("connection_id")
    .primaryKey()
    .references(() => connection.id, { onDelete: "cascade" }),
  historyId: text("history_id"),
  deltaLink: text("delta_link"),
  uidNext: integer("uid_next"),
  lastFullSyncAt: timestamp("last_full_sync_at"),
  lastDeltaAt: timestamp("last_delta_at"),
  syncLockedAt: timestamp("sync_locked_at"),
  lastRunId: text("last_run_id"),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at").notNull(),
})
