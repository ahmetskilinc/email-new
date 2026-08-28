import { headers } from "next/headers"
import { auth } from "./auth"
import { getActiveConnection, connectionToDriver } from "./server-utils"
import { ensureFreshAccessToken } from "./token-store"

export async function requireSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session?.user) throw new Error("Unauthorized")
  return session
}

export async function requireActiveDriver() {
  const session = await requireSession()
  const activeConnection = await getActiveConnection(session.user.id)
  // Refresh a nearly-expired OAuth token before building the driver, so the
  // interactive request never pays the provider's 401→refresh→retry cycle.
  // Cheap in the common case: a single Date comparison, no I/O.
  const freshConnection = await ensureFreshAccessToken(activeConnection)
  const driver = connectionToDriver(freshConnection)
  return { session, connection: freshConnection, driver }
}
