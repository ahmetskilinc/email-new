import { connection, user, userSettings } from "../db/schema"
import { eq, and } from "drizzle-orm"
import type { EProviders } from "../types"
import { createDriver } from "./driver"
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

const APP_PASSWORD_PROVIDERS = ["icloud", "yahoo"]

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
  })
}
