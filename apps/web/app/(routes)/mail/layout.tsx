"use client"

import { useConnections } from "@/hooks/use-connections"
import { useSession } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function MailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { data: session, isPending: sessionPending } = useSession()
  const { data: connectionsData, isPending: connectionsPending } =
    useConnections()

  useEffect(() => {
    console.log("[mail layout] sessionPending:", sessionPending, "connectionsPending:", connectionsPending)
    console.log("[mail layout] session:", session)
    console.log("[mail layout] connectionsData:", connectionsData)
    console.log("[mail layout] document.cookie:", document.cookie)

    if (sessionPending || connectionsPending) return

    if (!session?.user) {
      console.log("[mail layout] no session user, redirecting to /login")
      router.push("/login")
      return
    }

    if (!connectionsData?.connections?.length) {
      console.log("[mail layout] no connections, redirecting to /onboarding")
      router.push("/onboarding")
    }
  }, [session, sessionPending, connectionsData, connectionsPending, router])

  if (sessionPending || connectionsPending) return null
  if (!session?.user || !connectionsData?.connections?.length) return null

  return children
}
