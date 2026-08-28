"use client"

import { useConnections } from "@/hooks/use-connections"
import { useNewMailNotifier } from "@/hooks/use-new-mail-notifier"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import { useMailOpFailureToasts } from "@/hooks/use-thread-previews"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

/**
 * Session validation happens server-side in the proxy before this tree ever
 * renders, so the mail shell paints immediately — no blocking session or
 * connections fetch. The only client-side gate left is onboarding: a user
 * with a *confirmed* empty connections list is moved there after paint.
 * Cached or in-flight data never triggers the redirect.
 */
export default function MailLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { data: connectionsData, isFetched, isSuccess } = useConnections()

  useNewMailNotifier()
  useKeyboardShortcuts()
  useMailOpFailureToasts()

  useEffect(() => {
    if (!isFetched || !isSuccess) return
    if ((connectionsData?.connections?.length ?? 0) === 0) {
      router.replace("/onboarding")
    }
  }, [isFetched, isSuccess, connectionsData, router])

  return children
}
