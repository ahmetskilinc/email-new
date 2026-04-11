import { ipcMain } from "electron"
import { getDb } from "../db"
import { recipient, user } from "../db/schema"
import { eq, like, desc } from "drizzle-orm"

export function registerContactHandlers(): void {
  ipcMain.handle("contacts:search", async (_e, query: string) => {
    const db = getDb()
    const firstUser = db.select().from(user).limit(1).get()
    if (!firstUser) throw new Error("No local user found")

    return db
      .select()
      .from(recipient)
      .where(eq(recipient.userId, firstUser.id))
      .orderBy(desc(recipient.frequency))
      .limit(20)
      .all()
      .filter(
        (r) =>
          r.email.toLowerCase().includes(query.toLowerCase()) ||
          (r.name && r.name.toLowerCase().includes(query.toLowerCase())),
      )
  })
}
