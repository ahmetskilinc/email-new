import { ipcMain } from "electron"
import { getDb } from "../db"
import { connection, user } from "../db/schema"
import { eq } from "drizzle-orm"
import { createCalendarProvider } from "@workspace/core/calendar"
import type { CreateEventInput, UpdateEventInput, DeleteEventInput } from "@workspace/core/calendar/types"
import { ensureFreshTokens } from "../auth/refresh"

function getLocalUserId(): string {
  const db = getDb()
  const firstUser = db.select().from(user).limit(1).get()
  if (!firstUser) throw new Error("No local user found")
  return firstUser.id
}

function providerFromConn(conn: typeof connection.$inferSelect) {
  return createCalendarProvider(conn.providerId, {
    accessToken: conn.accessToken!,
    refreshToken: conn.refreshToken ?? "",
    email: conn.email,
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  })
}

export function registerCalendarHandlers(): void {
  ipcMain.handle("calendar:getEvents", async (_e, timeMin: string, timeMax: string) => {
    const db = getDb()
    const userId = getLocalUserId()
    const connections = db
      .select()
      .from(connection)
      .where(eq(connection.userId, userId))
      .all()

    const allEvents = await Promise.allSettled(
      connections
        .filter((c) => c.accessToken)
        .map(async (conn) => {
          const fresh = await ensureFreshTokens(conn)
          return providerFromConn(fresh).listEvents({
            timeMin: new Date(timeMin),
            timeMax: new Date(timeMax),
          })
        }),
    )

    return allEvents
      .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
      .flatMap((r) => r.value)
  })

  ipcMain.handle("calendar:getCalendars", async () => {
    const db = getDb()
    const userId = getLocalUserId()
    const connections = db
      .select()
      .from(connection)
      .where(eq(connection.userId, userId))
      .all()

    const allCalendars = await Promise.allSettled(
      connections
        .filter((c) => c.accessToken)
        .map(async (conn) => {
          const fresh = await ensureFreshTokens(conn)
          return providerFromConn(fresh).listCalendars()
        }),
    )

    return allCalendars
      .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
      .flatMap((r) => r.value)
  })

  async function firstConnection() {
    const db = getDb()
    const userId = getLocalUserId()
    const conn = db
      .select()
      .from(connection)
      .where(eq(connection.userId, userId))
      .limit(1)
      .get()
    if (!conn) throw new Error("No connection found")
    return ensureFreshTokens(conn)
  }

  ipcMain.handle("calendar:createEvent", async (_e, input: CreateEventInput) => {
    return providerFromConn(await firstConnection()).createEvent(input)
  })

  ipcMain.handle("calendar:updateEvent", async (_e, input: UpdateEventInput) => {
    return providerFromConn(await firstConnection()).updateEvent(input)
  })

  ipcMain.handle("calendar:deleteEvent", async (_e, input: DeleteEventInput) => {
    return providerFromConn(await firstConnection()).deleteEvent(input)
  })
}
