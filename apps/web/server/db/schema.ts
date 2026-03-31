import {
  pgTableCreator,
  text,
  timestamp,
  boolean,
  jsonb,
  unique,
  index,
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
      .$type<"google" | "microsoft" | "icloud" | "yahoo">()
      .notNull(),
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
