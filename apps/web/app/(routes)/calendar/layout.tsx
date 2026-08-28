"use client"

import { useConnections } from "@/hooks/use-connections"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * Session validation is server-side in the proxy; the calendar shell renders
 * immediately and only a confirmed-empty connections list redirects.
 */
export default function CalendarLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { data: connectionsData, isFetched, isSuccess } = useConnections()

  useEffect(() => {
    if (!isFetched || !isSuccess) return
    if ((connectionsData?.connections?.length ?? 0) === 0) {
      router.replace("/onboarding")
    }
  }, [isFetched, isSuccess, connectionsData, router])

  return children
}
