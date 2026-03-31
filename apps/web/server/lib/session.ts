import { headers } from "next/headers"
import { auth } from "./auth"
import { getActiveConnection, connectionToDriver } from "./server-utils"

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
  const driver = connectionToDriver(activeConnection)
  return { session, connection: activeConnection, driver }
}
