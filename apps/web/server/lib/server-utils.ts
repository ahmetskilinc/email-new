import { connection, user, userSettings, signature, recipient } from "../db/schema"
import { eq, and, or, ilike, desc, sql } from "drizzle-orm"
import type { EProviders } from "@workspace/core/types"
import { createDriver } from "@workspace/core/driver"
import { decrypt } from "./encryption"
import { createDb } from "../db"
import { env } from "../env"

let _sharedDb: ReturnType<typeof createDb> | null = null

const getSharedDb = () => {
  if (!_sharedDb) {
    _sharedDb = createDb(env.DATABASE_URL)
  }
  return _sharedDb.db
}

export const getzeitmailDB = async (userId: string) => {
  const db = getSharedDb()

  return {
    findManyConnections: () =>
      db.query.connection.findMany({ where: eq(connection.userId, userId) }),

    findUserConnection: (connectionId: string) =>
      db.query.connection.findFirst({
        where: and(
          eq(connection.id, connectionId),
          eq(connection.userId, userId),
        ),
      }),

    findFirstConnection: () =>
      db.query.connection.findFirst({
        where: eq(connection.userId, userId),
      }),

    deleteConnection: (connectionId: string) =>
      db
        .delete(connection)
        .where(
          and(
            eq(connection.id, connectionId),
            eq(connection.userId, userId),
          ),
        ),

    createConnection: (
      providerId: EProviders,
      email: string,
      info: {
        name?: string | null
        picture?: string | null
        accessToken: string
        refreshToken?: string | null
        scope: string
        expiresAt: Date
        imapConfig?: unknown
      },
    ) => {
      const now = new Date()
      const id = crypto.randomUUID()
      return db
        .insert(connection)
        .values({
          id,
          userId,
          providerId,
          email,
          name: info.name || null,
          picture: info.picture || null,
          accessToken: info.accessToken,
          refreshToken: info.refreshToken || null,
          scope: info.scope,
          imapConfig: info.imapConfig ?? null,
          expiresAt: info.expiresAt,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [connection.userId, connection.email],
          set: {
            providerId,
            accessToken: info.accessToken,
            refreshToken: info.refreshToken || null,
            scope: info.scope,
            imapConfig: info.imapConfig ?? null,
            expiresAt: info.expiresAt,
            name: info.name || null,
            picture: info.picture || null,
            updatedAt: now,
          },
        })
        .returning()
    },

    updateConnection: (
      connectionId: string,
      data: Partial<typeof connection.$inferInsert>,
    ) =>
      db
        .update(connection)
        .set({ ...data, updatedAt: new Date() })
        .where(
          and(
            eq(connection.id, connectionId),
            eq(connection.userId, userId),
          ),
        ),

    findUser: () => db.query.user.findFirst({ where: eq(user.id, userId) }),

    updateUser: (data: Partial<typeof user.$inferInsert>) =>
      db
        .update(user)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(user.id, userId)),

    deleteUser: () => db.delete(user).where(eq(user.id, userId)),

    findUserSettings: () =>
      db.query.userSettings.findFirst({
        where: eq(userSettings.userId, userId),
      }),

    insertUserSettings: (settings: any) => {
      const id = crypto.randomUUID()
      return db.insert(userSettings).values({
        id,
        userId,
        settings,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    },

    updateUserSettings: (settings: any) =>
      db
        .update(userSettings)
        .set({ settings, updatedAt: new Date() })
        .where(eq(userSettings.userId, userId)),

    findSignaturesByConnection: (connectionId: string) =>
      db.query.signature.findMany({
        where: and(
          eq(signature.connectionId, connectionId),
          eq(signature.userId, userId),
        ),
        orderBy: (s, { desc }) => [desc(s.isDefault), desc(s.createdAt)],
      }),

    findAllSignatures: () =>
      db.query.signature.findMany({
        where: eq(signature.userId, userId),
        orderBy: (s, { desc }) => [desc(s.isDefault), desc(s.createdAt)],
      }),

    findSignature: (id: string) =>
      db.query.signature.findFirst({
        where: and(eq(signature.id, id), eq(signature.userId, userId)),
      }),

    findDefaultSignature: (connectionId: string) =>
      db.query.signature.findFirst({
        where: and(
          eq(signature.connectionId, connectionId),
          eq(signature.userId, userId),
          eq(signature.isDefault, true),
        ),
      }),

    createSignature: (data: {
      connectionId: string
      name: string
      body: string
      isDefault: boolean
    }) => {
      const id = crypto.randomUUID()
      const now = new Date()
      return db
        .insert(signature)
        .values({
          id,
          userId,
          connectionId: data.connectionId,
          name: data.name,
          body: data.body,
          isDefault: data.isDefault,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
    },

    updateSignature: (
      id: string,
      data: Partial<{ name: string; body: string; isDefault: boolean }>,
    ) =>
      db
        .update(signature)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(signature.id, id), eq(signature.userId, userId))),

    deleteSignature: (id: string) =>
      db
        .delete(signature)
        .where(and(eq(signature.id, id), eq(signature.userId, userId))),

    clearDefaultSignatures: (connectionId: string) =>
      db
        .update(signature)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(signature.connectionId, connectionId),
            eq(signature.userId, userId),
            eq(signature.isDefault, true),
          ),
        ),

    searchRecipients: (query: string) =>
      db.query.recipient.findMany({
        where: and(
          eq(recipient.userId, userId),
          or(
            ilike(recipient.email, `%${query}%`),
            ilike(recipient.name, `%${query}%`),
          ),
        ),
        orderBy: [desc(recipient.frequency), desc(recipient.lastUsed)],
        limit: 10,
      }),

    upsertRecipient: (email: string, name?: string | null) => {
      const id = crypto.randomUUID()
      const now = new Date()
      return db
        .insert(recipient)
        .values({ id, userId, email, name: name ?? null, frequency: 1, lastUsed: now, createdAt: now })
        .onConflictDoUpdate({
          target: [recipient.userId, recipient.email],
          set: {
            name: name ?? undefined,
            frequency: sql`${recipient.frequency} + 1`,
            lastUsed: now,
          },
        })
    },

    listRecipients: (limit = 50, offset = 0) =>
      db.query.recipient.findMany({
        where: eq(recipient.userId, userId),
        orderBy: [desc(recipient.frequency), desc(recipient.lastUsed)],
        limit,
        offset,
      }),

    findRecipient: (id: string) =>
      db.query.recipient.findFirst({
        where: and(eq(recipient.id, id), eq(recipient.userId, userId)),
      }),

    createRecipient: (email: string, name?: string | null) => {
      const id = crypto.randomUUID()
      const now = new Date()
      return db
        .insert(recipient)
        .values({
          id,
          userId,
          email,
          name: name ?? null,
          frequency: 0,
          lastUsed: now,
          createdAt: now,
        })
        .returning()
    },

    updateRecipient: (id: string, data: { name?: string | null }) =>
      db
        .update(recipient)
        .set(data)
        .where(and(eq(recipient.id, id), eq(recipient.userId, userId))),

    deleteRecipient: (id: string) =>
      db
        .delete(recipient)
        .where(and(eq(recipient.id, id), eq(recipient.userId, userId))),
  }
}

export const getActiveConnection = async (userId: string) => {
  const db = await getzeitmailDB(userId)
  const userData = await db.findUser()

  if (userData?.defaultConnectionId) {
    const activeConnection = await db.findUserConnection(
      userData.defaultConnectionId,
    )
    if (activeConnection) return activeConnection
  }

  const firstConnection = await db.findFirstConnection()
  if (!firstConnection) {
    throw new Error("No connections found for user")
  }

  return firstConnection
}

const APP_PASSWORD_PROVIDERS = ["icloud", "yahoo", "custom"]

export function resolveAccessToken(conn: {
  providerId: string
  accessToken: string | null
}): string {
  if (!conn.accessToken) return ""
  if (!APP_PASSWORD_PROVIDERS.includes(conn.providerId)) return conn.accessToken

  try {
    return decrypt(conn.accessToken)
  } catch {
    return conn.accessToken
  }
}

export const connectionToDriver = (
  activeConnection: typeof connection.$inferSelect,
) => {
  const isAppPasswordProvider = APP_PASSWORD_PROVIDERS.includes(
    activeConnection.providerId,
  )
  if (
    !activeConnection.accessToken ||
    (!isAppPasswordProvider && !activeConnection.refreshToken)
  ) {
    throw new Error(
      `Invalid connection ${JSON.stringify(activeConnection?.id)}`,
    )
  }

  return createDriver(activeConnection.providerId, {
    auth: {
      userId: activeConnection.userId,
      accessToken: resolveAccessToken(activeConnection),
      refreshToken: activeConnection.refreshToken ?? "",
      email: activeConnection.email,
    },
    ...(activeConnection.imapConfig != null
      ? {
          imapConfig: activeConnection.imapConfig as import("@workspace/core/transport/provider-config").ImapProviderConfig,
        }
      : {}),
  })
}
