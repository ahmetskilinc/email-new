"use client"

import { Dialog, Avatar, ScrollArea } from "bruv-ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { setDefaultConnection } from "@/server/actions/connections"
import { activeConnectionQueryKey } from "@/hooks/use-connections"
import { activeConnectionIdAtom } from "@/store/connection"
import { useSession } from "@/lib/auth-client"
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
  const { data: session } = useSession()
  const [, setThreadId] = useQueryState("threadId")
  const setConnectionId = useSetAtom(activeConnectionIdAtom)

  const addLog = useCallback(
    (message: string, status: LogEntry["status"] = "done") => {
      setLogs((prev) => [
        ...prev,
        { message, timestamp: Date.now() - startTimeRef.current, status },
      ])
    },
    []
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
    if (!target || switchingRef.current || !session?.user?.id) return
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
      queryClient.setQueryData(activeConnectionQueryKey(session.user.id), {
        id: target.id,
        email: target.email,
        name: target.name,
        picture: target.picture,
        providerId: target.providerId,
      })
      void queryClient.invalidateQueries({
        queryKey: activeConnectionQueryKey(session.user.id),
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
  }, [target, session?.user?.id])

  const isOpen = target !== null
  const isDone =
    logs.length > 0 && logs[logs.length - 1]?.message === "Switch complete"

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && (isDone || error)) {
          onComplete(!!isDone)
        }
      }}
    >
      <Dialog.Content className="flex w-[90vw] max-w-md flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <Dialog.Title className="border-none p-0 text-base font-medium leading-none">
            Switching Account
          </Dialog.Title>
          <p className="text-sm text-bruv-tertiary">
            {error
              ? "Something went wrong while switching accounts."
              : "Please wait while we switch your account..."}
          </p>
        </div>

        {target && (
          <div className="flex items-center gap-3 rounded-bruv-lg border p-3">
            <Avatar
              size="md"
              src={target.picture ?? undefined}
              alt={target.name || target.email}
              initials={(target.name || target.email)
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {target.name || target.email}
              </p>
              {target.name && (
                <p className="truncate text-xs text-bruv-tertiary">
                  {target.email}
                </p>
              )}
            </div>
          </div>
        )}

        <ScrollArea className="h-[140px] w-full rounded-bruv-lg border">
          <div ref={scrollRef} className="p-3 font-mono text-[11px]">
            {logs.map((log, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 py-0.5",
                  log.status === "error" && "text-bruv-danger"
                )}
              >
                <span className="w-12 shrink-0 text-right text-bruv-tertiary tabular-nums">
                  {log.timestamp}ms
                </span>
                <span
                  className={cn(
                    "shrink-0",
                    log.status === "pending" && "text-bruv-tertiary",
                    log.status === "done" && "text-bruv-accent",
                    log.status === "error" && "text-bruv-danger"
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
              <div className="flex h-[116px] items-center justify-center text-bruv-tertiary">
                Initializing...
              </div>
            )}
          </div>
        </ScrollArea>
      </Dialog.Content>
    </Dialog.Root>
  )
}
