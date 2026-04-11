import { ipcMain } from "electron"
import { getDb } from "../db"
import { connection, user } from "../db/schema"
import { eq } from "drizzle-orm"
import { createDriver } from "@workspace/core/driver"
import type { MailManager, ManagerConfig } from "@workspace/core/driver/types"
import type { IOutgoingMessage } from "@workspace/core/types"
import { processEmailHtml } from "@workspace/core/email-processor"
import { defaultPageSize, FOLDERS } from "@workspace/core/utils"

function getLocalUserId(): string {
  const db = getDb()
  const firstUser = db.select().from(user).limit(1).get()
  if (!firstUser) throw new Error("No local user found")
  return firstUser.id
}

function getActiveConnection(): typeof connection.$inferSelect {
  const db = getDb()
  const userId = getLocalUserId()
  const userData = db.select().from(user).where(eq(user.id, userId)).get()
  if (!userData) throw new Error("No local user found")

  let conn: typeof connection.$inferSelect | undefined
  if (userData.defaultConnectionId) {
    conn = db
      .select()
      .from(connection)
      .where(eq(connection.id, userData.defaultConnectionId))
      .get()
  }
  if (!conn) {
    conn = db
      .select()
      .from(connection)
      .where(eq(connection.userId, userId))
      .limit(1)
      .get()
  }
  if (!conn) throw new Error("No email connection found")
  return conn
}

function connectionToDriver(conn: typeof connection.$inferSelect): MailManager {
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
    onAuthFailure: async (userId: string) => {
      const db = getDb()
      db.delete(connection).where(eq(connection.id, conn.id)).run()
    },
  }
  return createDriver(conn.providerId, config)
}

export function registerMailHandlers(): void {
  ipcMain.handle(
    "mail:listThreads",
    async (_e, folder: string, query?: string, maxResults?: number, cursor?: string, labelIds?: string[]) => {
      const conn = getActiveConnection()
      const driver = connectionToDriver(conn)
      return driver.list({
        folder,
        query,
        maxResults: maxResults ?? defaultPageSize,
        labelIds,
        pageToken: cursor || undefined,
      })
    },
  )

  ipcMain.handle("mail:listAllInboxes", async (_e, maxResults?: number, cursor?: string) => {
    const db = getDb()
    const userId = getLocalUserId()
    const connections = db
      .select()
      .from(connection)
      .where(eq(connection.userId, userId))
      .all()

    const cursors: Record<string, string> = cursor ? JSON.parse(cursor) : {}
    const results = await Promise.allSettled(
      connections
        .filter((c) => c.accessToken)
        .map(async (conn) => {
          const driver = connectionToDriver(conn)
          const result = await driver.list({
            folder: "inbox",
            maxResults: maxResults ?? defaultPageSize,
            pageToken: cursors[conn.id] || undefined,
          })
          return { connectionId: conn.id, ...result }
        }),
    )

    const allThreads = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
      .flatMap((r) =>
        r.value.threads.map((t: any) => ({
          ...t,
          connectionId: r.value.connectionId,
        })),
      )

    return { threads: allThreads, nextPageToken: null }
  })

  ipcMain.handle("mail:getThread", async (_e, id: string, connectionId?: string) => {
    let conn = getActiveConnection()
    if (connectionId && connectionId !== conn.id) {
      const db = getDb()
      const specificConn = db.select().from(connection).where(eq(connection.id, connectionId)).get()
      if (!specificConn) throw new Error("Connection not found")
      conn = specificConn
    }
    const driver = connectionToDriver(conn)
    return driver.get(id)
  })

  ipcMain.handle("mail:sendMail", async (_e, data: IOutgoingMessage) => {
    const conn = getActiveConnection()
    const driver = connectionToDriver(conn)
    return driver.create(data)
  })

  ipcMain.handle("mail:markAsRead", async (_e, threadIds: string[], connectionId?: string) => {
    let conn = getActiveConnection()
    if (connectionId) {
      const db = getDb()
      const specificConn = db.select().from(connection).where(eq(connection.id, connectionId)).get()
      if (specificConn) conn = specificConn
    }
    const driver = connectionToDriver(conn)
    return driver.markAsRead(threadIds)
  })

  ipcMain.handle("mail:markAsUnread", async (_e, threadIds: string[]) => {
    const conn = getActiveConnection()
    const driver = connectionToDriver(conn)
    return driver.markAsUnread(threadIds)
  })

  ipcMain.handle("mail:deleteThread", async (_e, id: string) => {
    const conn = getActiveConnection()
    const driver = connectionToDriver(conn)
    return driver.delete(id)
  })

  ipcMain.handle(
    "mail:modifyLabels",
    async (_e, ids: string[], options: { addLabels: string[]; removeLabels: string[] }) => {
      const conn = getActiveConnection()
      const driver = connectionToDriver(conn)
      return driver.modifyLabels(ids, options)
    },
  )

  ipcMain.handle(
    "mail:processEmailContent",
    async (_e, html: string, shouldLoadImages: boolean, theme: "light" | "dark") => {
      return processEmailHtml({ html, shouldLoadImages, theme })
    },
  )

  ipcMain.handle("mail:toggleStar", async (_e, threadIds: string[], starred: boolean) => {
    const conn = getActiveConnection()
    const driver = connectionToDriver(conn)
    if (starred) {
      return driver.modifyLabels(threadIds, {
        addLabels: ["STARRED"],
        removeLabels: [],
      })
    } else {
      return driver.modifyLabels(threadIds, {
        addLabels: [],
        removeLabels: ["STARRED"],
      })
    }
  })

  ipcMain.handle("mail:getRawEmail", async (_e, id: string) => {
    const conn = getActiveConnection()
    const driver = connectionToDriver(conn)
    return driver.getRawEmail(id)
  })

  ipcMain.handle("mail:count", async () => {
    const conn = getActiveConnection()
    const driver = connectionToDriver(conn)
    return driver.count()
  })
}
