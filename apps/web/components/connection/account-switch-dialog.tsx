"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { setDefaultConnection } from "@/server/actions/connections"
import { activeConnectionIdAtom } from "@/store/connection"
import { useCallback, useEffect, useRef, useState } from "react"
import { useQueryState } from "nuqs"
import { useSetAtom } from "jotai"
import { cn } from "@workspace/ui/lib/utils"

export interface SwitchTarget {
  id: string
  name: string | null
  email: string
  providerId: string
  picture: string | null
}

type LogEntry = {
  message: string
  timestamp: number
  status: "pending" | "done" | "error"
}

export function AccountSwitchDialog({
  target,
  onComplete,
}: {
  target: SwitchTarget | null
  onComplete: (success: boolean) => void
}) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const startTimeRef = useRef<number>(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const switchingRef = useRef(false)

  const queryClient = useQueryClient()
  const [, setThreadId] = useQueryState("threadId")
  const setConnectionId = useSetAtom(activeConnectionIdAtom)

  const addLog = useCallback(
    (message: string, status: LogEntry["status"] = "done") => {
      setLogs((prev) => [
        ...prev,
        { message, timestamp: Date.now() - startTimeRef.current, status },
      ])
    },
    [],
  )

  const markLastDone = useCallback(() => {
    setLogs((prev) => {
      if (prev.length === 0) return prev
      const updated = [...prev]
      updated[updated.length - 1] = {
        ...updated[updated.length - 1]!,
        status: "done",
      }
      return updated
    })
  }, [])

  useEffect(() => {
    if (!target || switchingRef.current) return
    switchingRef.current = true

    startTimeRef.current = Date.now()
    setLogs([])
    setError(null)

    const run = async () => {
      addLog("Clearing active thread...", "pending")
      await setThreadId(null)
      markLastDone()

      addLog("Setting default connection on server...", "pending")
      await setDefaultConnection(target.id)
      markLastDone()

      addLog("Switching active connection...", "pending")
      setConnectionId(target.id)
      queryClient.setQueryData(["activeConnection"], {
        id: target.id,
        email: target.email,
        name: target.name,
        picture: target.picture,
        providerId: target.providerId,
      })
      queryClient.invalidateQueries({ queryKey: ["threads"] })
      queryClient.invalidateQueries({ queryKey: ["allInboxes"] })
      markLastDone()

      addLog("Switch complete", "done")
    }

    run()
      .then(() => {
        onComplete(true)
        switchingRef.current = false
      })
      .catch((err) => {
        markLastDone()
        const msg = err instanceof Error ? err.message : "Unknown error"
        addLog(`Error: ${msg}`, "error")
        setError(msg)
        switchingRef.current = false
      })
  }, [target])

  const isOpen = target !== null
  const isDone =
    logs.length > 0 &&
    logs[logs.length - 1]?.message === "Switch complete"

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && (isDone || error)) {
          onComplete(!!isDone)
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switching Account</DialogTitle>
          <DialogDescription>
            {error
              ? "Something went wrong while switching accounts."
              : "Please wait while we switch your account..."}
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Avatar className="size-9">
              {target.picture && (
                <AvatarImage
                  src={target.picture}
                  alt={target.name || target.email}
                />
              )}
              <AvatarFallback className="text-[10px]">
                {(target.name || target.email)
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {target.name || target.email}
              </p>
              {target.name && (
                <p className="text-muted-foreground truncate text-xs">
                  {target.email}
                </p>
              )}
            </div>
          </div>
        )}

        <ScrollArea className="h-[140px] w-full rounded-lg border">
          <div ref={scrollRef} className="p-3 font-mono text-[11px]">
            {logs.map((log, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 py-0.5",
                  log.status === "error" && "text-destructive",
                )}
              >
                <span className="text-muted-foreground w-12 shrink-0 text-right tabular-nums">
                  {log.timestamp}ms
                </span>
                <span
                  className={cn(
                    "shrink-0",
                    log.status === "pending" && "text-muted-foreground",
                    log.status === "done" && "text-primary",
                    log.status === "error" && "text-destructive",
                  )}
                >
                  {log.status === "pending"
                    ? "○"
                    : log.status === "done"
                      ? "●"
                      : "✕"}
                </span>
                <span className="min-w-0 break-words">{log.message}</span>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-muted-foreground flex h-[116px] items-center justify-center">
                Initializing...
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
