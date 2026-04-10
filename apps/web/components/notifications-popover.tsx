"use client"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { Notification03Icon } from "@hugeicons-pro/core-stroke-rounded"
import {
  useNotifications,
  useUnreadNotificationCount,
  useNotificationActions,
} from "@/store/notifications"
import { useRouter, usePathname } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@workspace/ui/lib/utils"

export function NotificationsPopover() {
  const notifications = useNotifications()
  const unreadCount = useUnreadNotificationCount()
  const { markAsRead, markAllAsRead, clear } = useNotificationActions()
  const router = useRouter()
  const pathname = usePathname()

  const handleClick = (id: string, threadId: string) => {
    markAsRead(id)
    const base = pathname.startsWith("/mail/") ? pathname : "/mail/inbox"
    router.push(`${base}?threadId=${threadId}`)
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <HugeiconsIcon icon={Notification03Icon} className="size-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        }
      />
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-80 p-0"
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={markAllAsRead}
              >
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={clear}
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
              <HugeiconsIcon
                icon={Notification03Icon}
                className="size-8 text-muted-foreground/40"
              />
              <p className="text-sm text-muted-foreground">
                No notifications yet
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n.id, n.threadId)}
                  className={cn(
                    "flex flex-col gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                    !n.read && "bg-primary/5",
                  )}
                >
                  <div className="flex items-center gap-2">
                    {!n.read && (
                      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                    <span
                      className={cn(
                        "truncate text-sm",
                        !n.read ? "font-medium" : "text-muted-foreground",
                      )}
                    >
                      {n.from}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                      {formatDistanceToNow(n.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {n.subject}
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
