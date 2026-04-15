import { ipcMain } from "electron"
import { getDb } from "../db"
import { connection, user } from "../db/schema"
import { eq } from "drizzle-orm"
import { createDriver } from "@workspace/core/driver"
import type { MailManager, ManagerConfig } from "@workspace/core/driver/types"
import type { IOutgoingMessage } from "@workspace/core/types"
import { processEmailHtml } from "@workspace/core/email-processor"
import { getListUnsubscribeAction } from "@workspace/core/email-utils"
import { defaultPageSize, FOLDERS } from "@workspace/core/utils"
import { ensureFreshTokens } from "../auth/refresh"

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
    onAuthFailure: async (_userId: string) => {
      const db = getDb()
      db.delete(connection).where(eq(connection.id, conn.id)).run()
    },
  }
  return createDriver(conn.providerId, config)
}

async function activeDriver(): Promise<MailManager> {
  const conn = await ensureFreshTokens(getActiveConnection())
  return connectionToDriver(conn)
}

export function registerMailHandlers(): void {
  ipcMain.handle(
    "mail:listThreads",
    async (_e, folder: string, query?: string, maxResults?: number, cursor?: string, labelIds?: string[]) => {
      const driver = await activeDriver()
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
          const fresh = await ensureFreshTokens(conn)
          const driver = connectionToDriver(fresh)
          const result = await driver.list({
            folder: "inbox",
            maxResults: maxResults ?? defaultPageSize,
            pageToken: cursors[fresh.id] || undefined,
          })
          return { connectionId: fresh.id, ...result }
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
    const fresh = await ensureFreshTokens(conn)
    const driver = connectionToDriver(fresh)
    return driver.get(id)
  })

  ipcMain.handle("mail:sendMail", async (_e, data: IOutgoingMessage) => {
    const driver = await activeDriver()
    return driver.create(data)
  })

  ipcMain.handle("mail:markAsRead", async (_e, threadIds: string[], connectionId?: string) => {
    let conn = getActiveConnection()
    if (connectionId) {
      const db = getDb()
      const specificConn = db.select().from(connection).where(eq(connection.id, connectionId)).get()
      if (specificConn) conn = specificConn
    }
    const fresh = await ensureFreshTokens(conn)
    const driver = connectionToDriver(fresh)
    return driver.markAsRead(threadIds)
  })

  ipcMain.handle("mail:markAsUnread", async (_e, threadIds: string[]) => {
    const driver = await activeDriver()
    return driver.markAsUnread(threadIds)
  })

  ipcMain.handle("mail:deleteThread", async (_e, id: string) => {
    const driver = await activeDriver()
    return driver.delete(id)
  })

  ipcMain.handle(
    "mail:modifyLabels",
    async (_e, ids: string[], options: { addLabels: string[]; removeLabels: string[] }) => {
      const driver = await activeDriver()
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
    const driver = await activeDriver()
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
    const driver = await activeDriver()
    return driver.getRawEmail(id)
  })

  ipcMain.handle("mail:count", async () => {
    const driver = await activeDriver()
    return driver.count()
  })

  ipcMain.handle("mail:getEmailAliases", async () => {
    const driver = await activeDriver()
    return driver.getEmailAliases()
  })

  ipcMain.handle("mail:getMessageAttachments", async (_e, messageId: string) => {
    const driver = await activeDriver()
    return driver.getMessageAttachments(messageId)
  })

  ipcMain.handle(
    "mail:unsubscribeFromList",
    async (_e, input: { listUnsubscribe: string; listUnsubscribePost?: string }) => {
      const action = getListUnsubscribeAction(input)
      if (!action) throw new Error("No unsubscribe action available")

      if (action.type === "get" || action.type === "post") {
        const url = new URL(action.url)
        if (!url.protocol.startsWith("http")) {
          throw new Error("Invalid unsubscribe URL")
        }
        const hostname = url.hostname.toLowerCase()
        if (
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname === "0.0.0.0" ||
          hostname.startsWith("10.") ||
          hostname.startsWith("192.168.") ||
          hostname.startsWith("172.") ||
          hostname === "metadata.google.internal" ||
          hostname === "[::1]" ||
          hostname.endsWith(".local")
        ) {
          throw new Error("Invalid unsubscribe URL")
        }

        const res = await fetch(action.url, {
          method: action.type === "post" ? "POST" : "GET",
          headers:
            action.type === "post"
              ? { "Content-Type": "application/x-www-form-urlencoded" }
              : undefined,
          body: action.type === "post" ? action.body : undefined,
          redirect: "follow",
        })

        if (!res.ok) {
          throw new Error(`Unsubscribe request failed (${res.status})`)
        }

        return { type: "success" as const }
      }

      return {
        type: "email" as const,
        email: action.emailAddress,
        subject: action.subject,
      }
    },
  )

  ipcMain.handle("mail:sendDraft", async (_e, draftId: string, data: IOutgoingMessage) => {
    const driver = await activeDriver()
    return driver.sendDraft(draftId, data)
  })

  ipcMain.handle("mail:deleteDraft", async (_e, draftId: string) => {
    const driver = await activeDriver()
    return driver.deleteDraft(draftId)
  })

  ipcMain.handle("mail:getDraft", async (_e, draftId: string) => {
    const driver = await activeDriver()
    return driver.getDraft(draftId)
  })

  ipcMain.handle("mail:getAttachment", async (_e, messageId: string, attachmentId: string) => {
    const driver = await activeDriver()
    return driver.getAttachment(messageId, attachmentId)
  })

  ipcMain.handle(
    "mail:createLabel",
    async (_e, label: { name: string; color?: { backgroundColor: string; textColor: string } }) => {
      const driver = await activeDriver()
      return driver.createLabel(label)
    },
  )

  ipcMain.handle(
    "mail:updateLabel",
    async (
      _e,
      id: string,
      label: { name: string; color?: { backgroundColor: string; textColor: string } },
    ) => {
      const driver = await activeDriver()
      return driver.updateLabel(id, label)
    },
  )

  ipcMain.handle("mail:deleteLabel", async (_e, id: string) => {
    const driver = await activeDriver()
    return driver.deleteLabel(id)
  })
}
