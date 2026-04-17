"use server"

import { start } from "workflow/api"
import { requireSession } from "../lib/session"
import { getzeitmailDB } from "../lib/server-utils"
import { syncConnection } from "../workflows/sync-connection"

/**
 * Kicks off a background sync workflow for the given connection (or all of
 * the user's connections when omitted). Returns the workflow run IDs so
 * callers can poll status later.
 */
export async function syncConnectionNow(connectionId?: string) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)

  const connections = connectionId
    ? [await db.findUserConnection(connectionId)].filter(
        (c): c is NonNullable<typeof c> => Boolean(c),
      )
    : await db.findManyConnections()

  if (connections.length === 0) {
    return { started: [] as { connectionId: string; runId: string }[] }
  }

  const started = await Promise.all(
    connections
      .filter((c) => c.providerId === "google" && c.accessToken)
      .map(async (c) => {
        const run = await start(syncConnection, [{ connectionId: c.id }])
        return { connectionId: c.id, runId: run.runId }
      }),
  )

  return { started }
}
