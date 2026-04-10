"use client"

import { useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { pollNewMessages } from "@/server/actions/mail"
import { useActiveConnection } from "@/hooks/use-connections"
import { useSettings } from "@/hooks/use-settings"
import { useServiceWorker } from "@/hooks/use-service-worker"

const POLL_INTERVAL_MS = 30_000

export function useNewMailNotifier() {
  const { data: activeConnection } = useActiveConnection()
  const { data: settingsData } = useSettings()
  const queryClient = useQueryClient()
  const cursorRef = useRef<string | null>(null)
  const connectionIdRef = useRef<string | null>(null)
  const { showNotification } = useServiceWorker()

  const notifications = settingsData?.settings.notifications
  const enabled =
    !!activeConnection &&
    !!settingsData &&
    (notifications?.level ?? "all") !== "none"

  // Reset the cursor when the active connection changes so we don't
  // mistake the new inbox's contents for "new" mail.
  useEffect(() => {
    if (activeConnection?.id !== connectionIdRef.current) {
      connectionIdRef.current = activeConnection?.id ?? null
      cursorRef.current = null
    }
  }, [activeConnection?.id])

  useQuery({
    queryKey: ["poll-new-mail", activeConnection?.id],
    queryFn: async () => {
      const isHidden =
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"

      const res = await pollNewMessages(cursorRef.current)
      cursorRef.current = res.cursor

      console.log("[notifier] poll result:", res.newMessages.length, "new messages, desktop:", notifications?.desktop, "level:", notifications?.level)

      if (!notifications || res.newMessages.length === 0) return res

      const filtered = res.newMessages.filter((msg) => {
        if (notifications.level === "important" && !msg.isUnread) return false
        return true
      })

      console.log("[notifier] filtered:", filtered.length, "messages to notify")

      if (filtered.length === 0) return res

      for (const msg of filtered) {
        // In-app toasts only when tab is visible
        if (notifications.inApp && !isHidden) {
          toast(msg.from, { description: msg.subject })
        }

        // Desktop notifications
        if (Notification.permission === "granted") {
          if (!notifications.desktop) {
            console.warn("[notifier] desktop setting is OFF, skipping")
          } else {
            console.log("[notifier] firing notification for:", msg.from, msg.subject)
            try {
              await showNotification(msg.from, {
                body: msg.subject,
                tag: msg.id,
              })
              console.log("[notifier] showNotification completed")
            } catch (err) {
              console.warn("[notifier] showNotification failed:", err)
            }
          }
        } else {
          console.warn("[notifier] Notification.permission is:", Notification.permission)
        }
      }

      queryClient.invalidateQueries({ queryKey: ["threads"] })
      queryClient.invalidateQueries({ queryKey: ["allInboxes"] })

      return res
    },
    enabled,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
    gcTime: 0,
  })
}
