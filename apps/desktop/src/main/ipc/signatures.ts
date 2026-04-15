import { ipcMain } from "electron"
import { getDb } from "../db"
import { signature, user } from "../db/schema"
import { eq, and } from "drizzle-orm"

function getLocalUserId(): string {
  const db = getDb()
  const firstUser = db.select().from(user).limit(1).get()
  if (!firstUser) throw new Error("No local user found")
  return firstUser.id
}

export function registerSignatureHandlers(): void {
  ipcMain.handle("signatures:list", async (_e, connectionId?: string) => {
    const db = getDb()
    const userId = getLocalUserId()
    if (connectionId) {
      return db
        .select()
        .from(signature)
        .where(and(eq(signature.userId, userId), eq(signature.connectionId, connectionId)))
        .all()
    }
    return db.select().from(signature).where(eq(signature.userId, userId)).all()
  })

  ipcMain.handle(
    "signatures:create",
    async (_e, data: { connectionId: string; name: string; body: string; isDefault?: boolean }) => {
      const db = getDb()
      const userId = getLocalUserId()
      const now = new Date()
      const id = crypto.randomUUID()

      db.insert(signature)
        .values({
          id,
          userId,
          connectionId: data.connectionId,
          name: data.name,
          body: data.body,
          isDefault: data.isDefault ?? false,
          createdAt: now,
          updatedAt: now,
        })
        .run()

      return { id, success: true }
    },
  )

  ipcMain.handle(
    "signatures:update",
    async (_e, id: string, data: { name?: string; body?: string; isDefault?: boolean }) => {
      const db = getDb()
      const userId = getLocalUserId()
      db.update(signature)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(signature.id, id), eq(signature.userId, userId)))
        .run()
      return { success: true }
    },
  )

  ipcMain.handle("signatures:delete", async (_e, id: string) => {
    const db = getDb()
    const userId = getLocalUserId()
    db.delete(signature)
      .where(and(eq(signature.id, id), eq(signature.userId, userId)))
      .run()
    return { success: true }
  })
}
