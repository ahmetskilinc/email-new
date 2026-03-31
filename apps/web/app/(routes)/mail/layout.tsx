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
    if (sessionPending || connectionsPending) return

    if (!session?.user) {
      router.push("/login")
      return
    }

    if (!connectionsData?.connections?.length) {
      router.push("/onboarding")
    }
  }, [session, sessionPending, connectionsData, connectionsPending, router])

  if (sessionPending || connectionsPending) return null
  if (!session?.user || !connectionsData?.connections?.length) return null

  return children
}
