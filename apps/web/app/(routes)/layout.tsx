import { headers } from "next/headers"
import { redirect } from "next/navigation"
import {
  AUTH_SNAPSHOT_HEADER,
  decodeAuthSnapshot,
} from "@/lib/auth-snapshot"
import { SessionProvider } from "@/providers/session-provider"
import { RoutesLayoutClient } from "@/components/layout/routes-layout-client"

/**
 * Server shell for every authenticated route. The proxy has already validated
 * the session cookie for this request and forwarded a snapshot header, so the
 * whole client tree renders with identity known on frame one — no client-side
 * session fetch gates the first paint anymore.
 */
export default async function RoutesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const snapshot = decodeAuthSnapshot(
    (await headers()).get(AUTH_SNAPSHOT_HEADER)
  )

  // The proxy redirects unauthenticated requests before they get here; this
  // only fires if a route under (routes) is missing from its protectedPaths.
  if (!snapshot) redirect("/login")

  return (
    <SessionProvider initialSession={snapshot}>
      <RoutesLayoutClient>{children}</RoutesLayoutClient>
    </SessionProvider>
  )
}
