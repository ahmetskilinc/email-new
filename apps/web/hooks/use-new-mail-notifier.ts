"use client"

import { useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { pollNewMessages } from "@/server/actions/mail"
import { useActiveConnection } from "@/hooks/use-connections"
import { useSettings } from "@/hooks/use-settings"

const POLL_INTERVAL_MS = 30_000

export function useNewMailNotifier() {
  const { data: activeConnection } = useActiveConnection()
  const { data: settingsData } = useSettings()
  const queryClient = useQueryClient()
  const cursorRef = useRef<string | null>(null)
  const connectionIdRef = useRef<string | null>(null)

  const notifications = settingsData?.settings.notifications
  const enabled =
    !!activeConnection && (notifications?.level ?? "all") !== "none"

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
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return { cursor: cursorRef.current, newMessages: [] }
      }

      const res = await pollNewMessages(cursorRef.current)
      cursorRef.current = res.cursor

      if (!notifications || res.newMessages.length === 0) return res

      const filtered = res.newMessages.filter((msg) => {
        if (notifications.level === "important" && !msg.isUnread) return false
        return true
      })

      if (filtered.length === 0) return res

      // Fire toasts and desktop notifications
      for (const msg of filtered) {
        if (notifications.inApp) {
          toast(msg.from, { description: msg.subject })
        }

        if (
          notifications.desktop &&
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification(msg.from, {
              body: msg.subject,
              tag: msg.id,
            })
          } catch {
            // Swallow — some browsers require a service worker for Notification().
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["threads"] })
      queryClient.invalidateQueries({ queryKey: ["allInboxes"] })

      return res
    },
    enabled,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
    gcTime: 0,
  })
}
