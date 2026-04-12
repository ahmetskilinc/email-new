import { ipcMain } from "electron"
import { getDb } from "../db"
import { user, userSettings } from "../db/schema"
import { eq } from "drizzle-orm"
import { defaultUserSettings } from "@workspace/core/schemas"
import { registerOAuthHandlers } from "../auth/oauth"

export function registerAuthHandlers(): void {
  // Register OAuth IPC handlers (Google & Microsoft)
  registerOAuthHandlers()
  ipcMain.handle("auth:getUser", async () => {
    const db = getDb()
    const firstUser = db.select().from(user).limit(1).get()
    return firstUser ?? null
  })

  ipcMain.handle("auth:createLocalUser", async (_e, data: { name: string; email: string }) => {
    const db = getDb()
    const now = new Date()
    const id = crypto.randomUUID()

    db.insert(user)
      .values({
        id,
        name: data.name,
        email: data.email,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    // Insert default settings
    db.insert(userSettings)
      .values({
        id: crypto.randomUUID(),
        userId: id,
        settings: defaultUserSettings,
        createdAt: now,
        updatedAt: now,
      })
      .run()

    return { id }
  })

  ipcMain.handle("auth:deleteUser", async () => {
    const db = getDb()
    const firstUser = db.select().from(user).limit(1).get()
    if (firstUser) {
      db.delete(user).where(eq(user.id, firstUser.id)).run()
    }
    return { success: true }
  })
}
