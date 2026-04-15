import { ipcMain } from "electron"
import { getDb } from "../db"
import { user, userSettings } from "../db/schema"
import { eq } from "drizzle-orm"
import { defaultUserSettings } from "@workspace/core/schemas"

function getLocalUserId(): string {
  const db = getDb()
  const firstUser = db.select().from(user).limit(1).get()
  if (!firstUser) throw new Error("No local user found")
  return firstUser.id
}

export function registerSettingsHandlers(): void {
  ipcMain.handle("settings:get", async () => {
    const db = getDb()
    const userId = getLocalUserId()
    const settings = db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .get()
    return settings?.settings ?? defaultUserSettings
  })

  ipcMain.handle("settings:save", async (_e, newSettings: typeof defaultUserSettings) => {
    const db = getDb()
    const userId = getLocalUserId()
    const now = new Date()
    const existing = db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .get()

    if (existing) {
      db.update(userSettings)
        .set({ settings: newSettings, updatedAt: now })
        .where(eq(userSettings.userId, userId))
        .run()
    } else {
      db.insert(userSettings)
        .values({
          id: crypto.randomUUID(),
          userId,
          settings: newSettings,
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }
    return { success: true }
  })
}
