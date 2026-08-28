"use client"

import { useConnections } from "@/hooks/use-connections"
import { authClient } from "@/lib/auth-client"
import { Button } from "@workspace/ui/components/button"
import { useOpenSettings } from "@/store/settings"
import { toast } from "sonner"

const OAUTH_PROVIDERS = new Set(["google", "microsoft"])

/**
 * Shown when a connection's credential died (revoked or expired refresh
 * token). The connection row survives with status "reauth_required" — the
 * inbox keeps painting from cached data — and a re-link through the provider
 * restores it in place. Replaces the old behavior of silently deleting the
 * connection and bouncing the user to onboarding.
 */
export function ReconnectBanner() {
  const { data } = useConnections()
  const openSettings = useOpenSettings()

  const disconnected = (data?.connections ?? []).filter((c) =>
    data?.disconnectedIds?.includes(c.id)
  )
  const first = disconnected[0]
  if (!first) return null

  const handleReconnect = () => {
    if (OAUTH_PROVIDERS.has(first.providerId)) {
      toast.promise(
        authClient.linkSocial({
          provider: first.providerId,
          callbackURL: `${window.location.origin}/mail/inbox`,
        }),
        { error: "Reconnect redirect failed" }
      )
    } else {
      // App-password providers re-enter credentials via connection settings.
      openSettings("connections")
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-amber-500/10 px-4 py-2 text-sm">
      <span className="truncate">
        <span className="font-medium">{first.email}</span> needs to be
        reconnected — its access has expired.
        {disconnected.length > 1 &&
          ` (${disconnected.length - 1} more affected)`}
      </span>
      <Button size="sm" variant="outline" onClick={handleReconnect}>
        Reconnect
      </Button>
    </div>
  )
}
