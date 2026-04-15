import { ipcMain } from "electron"
import { getDb } from "../db"
import { connection, user } from "../db/schema"
import { eq } from "drizzle-orm"
import { createDriver } from "@workspace/core/driver"
import type { ManagerConfig } from "@workspace/core/driver/types"
import type { CreateDraftData } from "@workspace/core/schemas"
import { ensureFreshTokens } from "../auth/refresh"

async function resolveDraftDriver() {
  const db = getDb()
  const firstUser = db.select().from(user).limit(1).get()
  if (!firstUser) throw new Error("No local user found")

  const rawConn = firstUser.defaultConnectionId
    ? db.select().from(connection).where(eq(connection.id, firstUser.defaultConnectionId)).get()
    : db.select().from(connection).where(eq(connection.userId, firstUser.id)).limit(1).get()

  if (!rawConn) throw new Error("No connection found")
  const conn = await ensureFreshTokens(rawConn)

  const config: ManagerConfig = {
    auth: {
      userId: conn.userId,
      accessToken: conn.accessToken ?? "",
      refreshToken: conn.refreshToken ?? "",
      email: conn.email,
    },
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    imapConfig: conn.imapConfig as ManagerConfig["imapConfig"],
  }
  return createDriver(conn.providerId, config)
}

export function registerDraftHandlers(): void {
  ipcMain.handle("drafts:list", async () => {
    const driver = await resolveDraftDriver()
    return driver.listDrafts({ maxResults: 50 })
  })

  ipcMain.handle("drafts:create", async (_e, data: CreateDraftData) => {
    const driver = await resolveDraftDriver()
    return driver.createDraft(data)
  })
}
