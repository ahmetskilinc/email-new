import { headers } from "next/headers"
import { redirect } from "next/navigation"
import {
  AUTH_SNAPSHOT_HEADER,
  decodeAuthSnapshot,
} from "@/lib/auth-snapshot"
import { SessionProvider } from "@/providers/session-provider"

/**
 * Onboarding is proxy-protected like the (routes) group, but lives in the
 * (auth) segment; this layout gives it the same server-seeded session so
 * hooks like useConnections work identically here.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const snapshot = decodeAuthSnapshot(
    (await headers()).get(AUTH_SNAPSHOT_HEADER)
  )
  if (!snapshot) redirect("/login")

  return <SessionProvider initialSession={snapshot}>{children}</SessionProvider>
}
