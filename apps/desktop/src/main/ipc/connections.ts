import { ipcMain } from "electron"
import { getDb } from "../db"
import { connection, user } from "../db/schema"
import { eq, and } from "drizzle-orm"
import { createDriver } from "@workspace/core/driver"
import type { EProviders } from "@workspace/core/types"
import { encryptNullable } from "../auth/credentials"

function getLocalUserId(): string {
  // Single-user desktop app — use the first (and only) user
  const db = getDb()
  const firstUser = db.select().from(user).limit(1).get()
  if (!firstUser) throw new Error("No local user found. Please complete onboarding.")
  return firstUser.id
}

export function registerConnectionHandlers(): void {
  ipcMain.handle("connections:list", async () => {
    const db = getDb()
    const userId = getLocalUserId()
    const rows = db
      .select()
      .from(connection)
      .where(eq(connection.userId, userId))
      .all()
    // Never ship tokens across the context bridge — the renderer only needs
    // connection metadata for the account switcher / settings UI.
    return rows.map(({ accessToken: _a, refreshToken: _r, ...rest }) => rest)
  })

  ipcMain.handle("connections:setDefault", async (_e, connectionId: string) => {
    const db = getDb()
    const userId = getLocalUserId()
    db.update(user)
      .set({ defaultConnectionId: connectionId, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .run()
    return { success: true }
  })

  ipcMain.handle("connections:delete", async (_e, connectionId: string) => {
    const db = getDb()
    const userId = getLocalUserId()
    db.delete(connection)
      .where(and(eq(connection.id, connectionId), eq(connection.userId, userId)))
      .run()
    return { success: true }
  })

  ipcMain.handle(
    "connections:createImap",
    async (
      _e,
      providerId: string,
      email: string,
      data: {
        name?: string
        picture?: string
        accessToken: string
        refreshToken?: string
        scope: string
        expiresAt: string
        imapConfig?: unknown
      },
    ) => {
      const db = getDb()
      const userId = getLocalUserId()
      const now = new Date()
      const id = crypto.randomUUID()

      db.insert(connection)
        .values({
          id,
          userId,
          providerId: providerId as EProviders,
          email,
          name: data.name ?? null,
          picture: data.picture ?? null,
          // IMAP app passwords live in the access_token column. Encrypt them
          // at rest via Electron's safeStorage API (OS keychain on macOS /
          // Windows, libsecret on Linux). See auth/credentials.ts.
          accessToken: encryptNullable(data.accessToken),
          refreshToken: encryptNullable(data.refreshToken ?? null),
          scope: data.scope,
          imapConfig: data.imapConfig ?? null,
          expiresAt: new Date(data.expiresAt),
          createdAt: now,
          updatedAt: now,
        })
        .run()

      // Set as default if it's the first connection
      const userData = db
        .select()
        .from(user)
        .where(eq(user.id, userId))
        .get()
      if (userData && !userData.defaultConnectionId) {
        db.update(user)
          .set({ defaultConnectionId: id, updatedAt: now })
          .where(eq(user.id, userId))
          .run()
      }

      return { id, success: true }
    },
  )
}
