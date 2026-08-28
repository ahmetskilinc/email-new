"use client"

import { createContext, useContext, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import type { AuthSnapshot } from "@/lib/auth-snapshot"
import { clearPersistedQueryCache } from "@/providers/query-provider"
import { authClient } from "@/lib/auth-client"

const SessionSnapshotContext = createContext<AuthSnapshot | null>(null)

/**
 * The proxy-validated session identity, available synchronously on the first
 * render frame. This is a render seed, not authorization — server actions
 * keep validating the HttpOnly cookie on every call.
 */
export function useSessionSnapshot(): AuthSnapshot {
  const snapshot = useContext(SessionSnapshotContext)
  if (!snapshot) {
    throw new Error(
      "useSessionSnapshot must be used inside a SessionProvider (a proxy-protected route)"
    )
  }
  return snapshot
}

/** Minimum gap between background session revalidations (focus-triggered). */
const REVALIDATE_MIN_INTERVAL_MS = 60_000

export function SessionProvider({
  initialSession,
  children,
}: {
  initialSession: AuthSnapshot
  children: React.ReactNode
}) {
  const router = useRouter()
  const lastCheckRef = useRef(0)

  // Background revalidation, never a render gate. The proxy already verified
  // the cookie for this document; this catches sessions revoked while a tab
  // stays open. Only a *confirmed* negative (the server answered and said
  // "no session") signs the tab out — a network failure means offline, and
  // offline is exactly when the local-first UI must keep working.
  useEffect(() => {
    let cancelled = false

    const check = async () => {
      const now = Date.now()
      if (now - lastCheckRef.current < REVALIDATE_MIN_INTERVAL_MS) return
      lastCheckRef.current = now
      try {
        const { data, error } = await authClient.getSession()
        if (cancelled) return
        const confirmedNegative =
          (!error && !data?.user) || error?.status === 401
        if (confirmedNegative) {
          await clearPersistedQueryCache()
          router.replace("/login")
        }
      } catch {
        // Network error — treat as offline, keep rendering local data.
      }
    }

    const idle = window.setTimeout(check, 1_000)
    const onFocus = () => void check()
    window.addEventListener("focus", onFocus)
    return () => {
      cancelled = true
      window.clearTimeout(idle)
      window.removeEventListener("focus", onFocus)
    }
  }, [router])

  return (
    <SessionSnapshotContext.Provider value={initialSession}>
      {children}
    </SessionSnapshotContext.Provider>
  )
}
