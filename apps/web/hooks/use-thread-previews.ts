"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"
import { toast } from "sonner"
import {
  useHydrated,
  useIndex,
  useQuery as useSyncQuery,
  useSyncClient,
} from "@ahmetskilinc/sync-react"
import type { SyncClient } from "@ahmetskilinc/sync-client"
import {
  ConnectionSyncStatus,
  MailOp,
  ThreadPreview,
  type MailOpKind,
  type ThreadPreviewRecord,
} from "@workspace/core/sync"
import { SYNC_ENGINE_ENABLED } from "@/providers/sync-provider"

/**
 * The store-backed inbox read path, shaped exactly like the legacy
 * listThreads items so every existing component (mail-list rows,
 * normalizeThreadPreview, thread routing) works unchanged during rollout.
 * The $raw.preview projection is the same one the server actions produce.
 */
export type LegacyThreadItem = {
  id: string
  connectionId: string
  historyId: string | null
  $raw: unknown
}

function toLegacyItem(record: ThreadPreviewRecord): LegacyThreadItem {
  return {
    id: record.providerThreadId,
    connectionId: record.connectionId,
    historyId: null,
    $raw: {
      preview: {
        sender: {
          name: record.sender?.name ?? undefined,
          email: record.sender?.email ?? "unknown",
        },
        subject: record.subject ?? "(no subject)",
        receivedOn: record.lastMessageAt,
        unread: record.unread,
        starred: record.starred,
        snippet: record.snippet ?? undefined,
        hasAttachments: record.hasAttachments ?? undefined,
      },
    },
  }
}

const UNDO_TOAST_DURATION_MS = 6_000

function useInboxPreviewRowsReal(
  connectionId: string | null,
  limit: number
): LegacyThreadItem[] | null {
  const hydrated = useHydrated()
  const rows = useIndex(
    ThreadPreview,
    connectionId ? "inbox" : "inboxAll",
    connectionId ?? "all",
    { limit }
  )
  return useMemo(() => {
    // Empty store = initial sync still filling (or the feeder is off): the
    // caller falls back to the legacy live-fetch path, so day one keeps
    // working while backfill catches up in the background.
    if (!hydrated || rows.length === 0) return null
    return rows.map(toLegacyItem)
  }, [hydrated, rows])
}

/**
 * Store-backed inbox rows (newest first), or null when the local-first path
 * cannot serve this view yet — the caller then uses the legacy query path.
 */
export const useInboxPreviewRows: (
  connectionId: string | null,
  limit: number
) => LegacyThreadItem[] | null = SYNC_ENGINE_ENABLED
  ? useInboxPreviewRowsReal
  : () => null

// ---------------------------------------------------------------------------
// Mutations: optimistic local transactions + the durable MailOp outbox
// ---------------------------------------------------------------------------

export type SyncThreadActions = {
  /** Each returns true when handled locally; false → caller falls back. */
  archive: (providerThreadIds: string[]) => boolean
  deleteThreads: (providerThreadIds: string[]) => boolean
  toggleStar: (providerThreadIds: string[], starred?: boolean) => boolean
  markRead: (providerThreadIds: string[]) => boolean
  markUnread: (providerThreadIds: string[]) => boolean
}

function lookupRecords(
  client: SyncClient,
  providerThreadIds: string[]
): ThreadPreviewRecord[] {
  const wanted = new Set(providerThreadIds)
  return client.store.find(ThreadPreview, (record) =>
    wanted.has(record.providerThreadId)
  )
}

/** One MailOp per connection touched, so the worker maps 1:1 onto a driver. */
function createMailOps(
  client: SyncClient,
  records: ThreadPreviewRecord[],
  op: MailOpKind,
  labels?: { addLabels?: string[]; removeLabels?: string[] }
): void {
  const byConnection = new Map<string, ThreadPreviewRecord[]>()
  for (const record of records) {
    let list = byConnection.get(record.connectionId)
    if (!list) byConnection.set(record.connectionId, (list = []))
    list.push(record)
  }
  client.transact((tx) => {
    for (const [connectionId, list] of byConnection) {
      tx.create(MailOp, {
        userId: list[0]!.userId,
        connectionId,
        threadIds: list.map((record) => record.providerThreadId),
        op,
        addLabels: labels?.addLabels ?? null,
        removeLabels: labels?.removeLabels ?? null,
        status: "pending",
        attempts: 0,
        error: null,
        createdAt: new Date().toISOString(),
      })
    }
  })
}

function patchRecords(
  client: SyncClient,
  records: ThreadPreviewRecord[],
  patch: (record: ThreadPreviewRecord) => Partial<{
    unread: boolean
    starred: boolean
    labels: string[]
  }>
): void {
  client.transact((tx) => {
    for (const record of records) {
      tx.update(ThreadPreview, record.id, patch(record))
    }
  })
}

const withLabel = (labels: string[], label: string) =>
  labels.includes(label) ? labels : [...labels, label]
const withoutLabel = (labels: string[], label: string) =>
  labels.filter((l) => l !== label)

function useSyncThreadActionsReal(): SyncThreadActions {
  const client = useSyncClient()

  const removal = useCallback(
    (providerThreadIds: string[], action: "archive" | "delete"): boolean => {
      const records = lookupRecords(client, providerThreadIds)
      if (records.length === 0) return false

      if (action === "archive") {
        patchRecords(client, records, (r) => ({
          labels: withoutLabel(r.labels, "INBOX"),
        }))
        createMailOps(client, records, "archive")
      } else {
        patchRecords(client, records, (r) => ({
          labels: withLabel(withoutLabel(r.labels, "INBOX"), "TRASH"),
        }))
        createMailOps(client, records, "delete")
      }

      const noun =
        records.length > 1 ? `${records.length} threads` : "Thread"
      toast(action === "archive" ? `${noun} archived` : `${noun} deleted`, {
        duration: UNDO_TOAST_DURATION_MS,
        action: {
          label: "Undo",
          onClick: () => {
            // Counter-transaction: rows come straight back, and the inverse
            // MailOp restores provider state (delete-undo always re-inboxes —
            // folder-based transports need a destination).
            patchRecords(client, records, (r) => ({
              labels: withLabel(withoutLabel(r.labels, "TRASH"), "INBOX"),
            }))
            createMailOps(client, records, "modifyLabels", {
              addLabels: ["INBOX"],
              removeLabels: action === "delete" ? ["TRASH"] : [],
            })
          },
        },
      })
      return true
    },
    [client]
  )

  const archive = useCallback(
    (ids: string[]) => removal(ids, "archive"),
    [removal]
  )
  const deleteThreads = useCallback(
    (ids: string[]) => removal(ids, "delete"),
    [removal]
  )

  const toggleStar = useCallback(
    (providerThreadIds: string[], starred?: boolean): boolean => {
      const records = lookupRecords(client, providerThreadIds)
      if (records.length === 0) return false
      const value = starred ?? !records.some((record) => record.starred)
      patchRecords(client, records, () => ({ starred: value }))
      createMailOps(client, records, value ? "star" : "unstar")
      return true
    },
    [client]
  )

  const setRead = useCallback(
    (providerThreadIds: string[], unread: boolean): boolean => {
      const records = lookupRecords(client, providerThreadIds)
      if (records.length === 0) return false
      patchRecords(client, records, () => ({ unread }))
      createMailOps(client, records, unread ? "markUnread" : "markRead")
      return true
    },
    [client]
  )

  const markRead = useCallback(
    (ids: string[]) => setRead(ids, false),
    [setRead]
  )
  const markUnread = useCallback(
    (ids: string[]) => setRead(ids, true),
    [setRead]
  )

  return useMemo(
    () => ({ archive, deleteThreads, toggleStar, markRead, markUnread }),
    [archive, deleteThreads, toggleStar, markRead, markUnread]
  )
}

export const useSyncThreadActions: () => SyncThreadActions | null =
  SYNC_ENGINE_ENABLED ? useSyncThreadActionsReal : () => null

// ---------------------------------------------------------------------------
// Surfaces: initial-sync progress + failed-op toasts
// ---------------------------------------------------------------------------

export type SyncProgress = {
  backfillComplete: boolean
  syncedThreadCount: number
}

function useSyncProgressReal(): SyncProgress | null {
  const statuses = useSyncQuery(ConnectionSyncStatus)
  return useMemo(() => {
    if (statuses.length === 0) return null
    const pending = statuses.filter((status) => !status.backfillComplete)
    if (pending.length === 0) return null
    return {
      backfillComplete: false,
      syncedThreadCount: statuses.reduce(
        (sum, status) => sum + status.syncedThreadCount,
        0
      ),
    }
  }, [statuses])
}

/** Non-null while any connection's backfill is still filling the store. */
export const useSyncProgress: () => SyncProgress | null = SYNC_ENGINE_ENABLED
  ? useSyncProgressReal
  : () => null

function useMailOpFailureToastsReal(): void {
  const failed = useSyncQuery(
    MailOp,
    (ops) => ops.filter((op) => op.status === "failed"),
    []
  )
  const surfaced = useRef(new Set<string>())
  useEffect(() => {
    for (const op of failed) {
      if (surfaced.current.has(op.id)) continue
      surfaced.current.add(op.id)
      toast.error(
        `A mail action failed and was rolled back${op.error ? `: ${op.error}` : ""}`
      )
    }
  }, [failed])
}

/** Surfaces terminal MailOp failures once each (the sync reconciles state). */
export const useMailOpFailureToasts: () => void = SYNC_ENGINE_ENABLED
  ? useMailOpFailureToastsReal
  : () => undefined
