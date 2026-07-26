"use server"

import { requireSession } from "../lib/session"
import { auth } from "../lib/auth"
import { headers } from "next/headers"
import {
  connectionToDriver,
  getzeitmailDB,
  resolveAccessToken,
  resolveRefreshToken,
} from "../lib/server-utils"
import { logSecurityEvent } from "../lib/audit"

export async function deleteUser() {
  const session = await requireSession()

  // Revoke every upstream grant before the cascade removes the rows holding the
  // tokens. Without this, deleting the account leaves live Google/Microsoft
  // grants behind with no remaining way to revoke them.
  const db = await getzeitmailDB(session.user.id)
  const connections = await db.findManyConnections().catch(() => [])
  for (const conn of connections) {
    try {
      const token = resolveRefreshToken(conn) || resolveAccessToken(conn)
      if (token) await connectionToDriver(conn).revokeToken(token)
    } catch (error) {
      console.error(
        "[deleteUser] upstream revocation failed for connection",
        conn.id,
        error instanceof Error ? error.message : error
      )
    }
  }

  await logSecurityEvent("account_deleted", session.user.id, {
    connectionCount: connections.length,
  })

  await auth.api.deleteUser({
    headers: await headers(),
    body: {},
  })
  return { success: true }
}
