"use server"

import { start } from "workflow/api"
import { requireSession } from "../lib/session"
import { getzeitmailDB } from "../lib/server-utils"
import {
  syncConnection,
  scheduleSyncConnection,
} from "../workflows/sync-connection"

/**
 * One-shot sync for the given connection (or all of the user's connections).
 * Use for the "refresh" button and immediately after a new account connects.
 */
export async function syncConnectionNow(connectionId?: string) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)

  const connections = connectionId
    ? [await db.findUserConnection(connectionId)].filter(
        (c): c is NonNullable<typeof c> => Boolean(c),
      )
    : await db.findManyConnections()

  const started = await Promise.all(
    connections
      .filter((c) => c.accessToken)
      .map(async (c) => {
        const run = await start(syncConnection, [{ connectionId: c.id }])
        return { connectionId: c.id, runId: run.runId }
      }),
  )

  return { started }
}

/**
 * Starts the durable scheduler loop for a connection. Safe to call more than
 * once — if a previous scheduler is still running, the new one will contend
 * for the sync lock and no-op. Call on connect and on first login.
 */
export async function startSyncSchedulerForConnection(connectionId: string) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)
  const conn = await db.findUserConnection(connectionId)
  if (!conn) throw new Error("Connection not found")

  const run = await start(scheduleSyncConnection, [{ connectionId }])
  return { connectionId, runId: run.runId }
}
