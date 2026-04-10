import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import { useCallback } from "react"

export interface NotificationItem {
  id: string
  from: string
  subject: string
  threadId: string
  timestamp: number
  read: boolean
}

const MAX_NOTIFICATIONS = 50

const notificationsAtom = atom<NotificationItem[]>([])
const unreadCountAtom = atom((get) =>
  get(notificationsAtom).filter((n) => !n.read).length,
)

export function useNotifications() {
  return useAtomValue(notificationsAtom)
}

export function useUnreadNotificationCount() {
  return useAtomValue(unreadCountAtom)
}

export function useNotificationActions() {
  const setNotifications = useSetAtom(notificationsAtom)

  const add = useCallback(
    (items: Omit<NotificationItem, "timestamp" | "read">[]) => {
      setNotifications((prev) => {
        const existingIds = new Set(prev.map((n) => n.id))
        const fresh = items
          .filter((item) => !existingIds.has(item.id))
          .map((item) => ({
            ...item,
            timestamp: Date.now(),
            read: false,
          }))
        if (fresh.length === 0) return prev
        return [...fresh, ...prev].slice(0, MAX_NOTIFICATIONS)
      })
    },
    [setNotifications],
  )

  const markAsRead = useCallback(
    (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
      )
    },
    [setNotifications],
  )

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [setNotifications])

  const clear = useCallback(() => {
    setNotifications([])
  }, [setNotifications])

  return { add, markAsRead, markAllAsRead, clear }
}
