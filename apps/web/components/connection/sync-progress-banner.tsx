"use client"

import { useSyncProgress } from "@/hooks/use-thread-previews"

/**
 * Shown while a connection's initial backfill is still filling the local
 * store. The list underneath renders whatever is already synced — nothing
 * blocks — this just explains why older mail is still appearing.
 */
export function SyncProgressBanner() {
  const progress = useSyncProgress()
  if (!progress) return null
  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-1.5 text-xs text-muted-foreground">
      <span className="size-3 animate-spin rounded-full border border-muted-foreground border-t-transparent" />
      Syncing your mailbox — {progress.syncedThreadCount.toLocaleString()}{" "}
      threads so far
    </div>
  )
}
