"use client"

import {
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query"
import { useParams, usePathname } from "next/navigation"
import { useSetAtom } from "jotai"
import { useCallback, useMemo } from "react"
import { toast } from "sonner"
import { backgroundQueueAtom } from "@/store/backgroundQueue"
import {
  bulkArchive,
  bulkDelete,
  toggleStar as toggleStarServer,
  markAsRead,
  markAsUnread,
  modifyLabels,
} from "@/server/actions/mail"
import { normalizeThreadPreview } from "@/lib/thread-utils"

type ThreadListItem = { id: string; $raw?: unknown }
type ThreadListPage = {
  threads?: ThreadListItem[]
  nextPageToken?: string | null
}
type ThreadListData = InfiniteData<ThreadListPage>

// Every thread-list cache the app renders from. Patches touch both so a flag
// flip is visible regardless of which view is open; invalidation stays scoped
// to the active view's key only.
const LIST_BASE_KEYS: QueryKey[] = [["threads"], ["allInboxes"]]

type PreviewPatch = { unread?: boolean; starred?: boolean }

/**
 * Optimistically patch the normalized preview flags of threads inside every
 * cached thread list, in place, without refetching. normalizeThreadPreview
 * reads `$raw.preview.{unread,starred}` first, so writing there wins over
 * whatever provider-specific shape the raw payload has.
 */
export function patchThreadPreviews(
  queryClient: QueryClient,
  threadIds: string[],
  patch: PreviewPatch
) {
  const idSet = new Set(threadIds)
  for (const baseKey of LIST_BASE_KEYS) {
    const entries = queryClient.getQueriesData<ThreadListData>({
      queryKey: baseKey,
    })
    for (const [key, data] of entries) {
      if (!data?.pages) continue
      queryClient.setQueryData<ThreadListData>(key, {
        ...data,
        pages: data.pages.map((page) => {
          if (!Array.isArray(page?.threads)) return page
          return {
            ...page,
            threads: page.threads.map((t) => {
              if (!idSet.has(t.id)) return t
              const raw = (t.$raw ?? {}) as Record<string, unknown>
              const preview = (raw.preview ?? {}) as Record<string, unknown>
              return { ...t, $raw: { ...raw, preview: { ...preview, ...patch } } }
            }),
          }
        }),
      })
    }
  }
}

type ListSnapshot = [QueryKey, ThreadListData | undefined][]

function snapshotLists(queryClient: QueryClient): ListSnapshot {
  return LIST_BASE_KEYS.flatMap((baseKey) =>
    queryClient.getQueriesData<ThreadListData>({ queryKey: baseKey })
  )
}

function restoreLists(queryClient: QueryClient, snapshot: ListSnapshot) {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data)
  }
}

async function cancelListQueries(queryClient: QueryClient) {
  await Promise.all(
    LIST_BASE_KEYS.map((baseKey) =>
      queryClient.cancelQueries({ queryKey: baseKey })
    )
  )
}

/** Read the current starred state of the given threads from the list caches. */
function anyStarredInCache(
  queryClient: QueryClient,
  threadIds: string[]
): boolean | undefined {
  const idSet = new Set(threadIds)
  let found = false
  let anyStarred = false
  for (const baseKey of LIST_BASE_KEYS) {
    const entries = queryClient.getQueriesData<ThreadListData>({
      queryKey: baseKey,
    })
    for (const [, data] of entries) {
      if (!data?.pages) continue
      for (const page of data.pages) {
        if (!Array.isArray(page?.threads)) continue
        for (const t of page.threads) {
          if (!idSet.has(t.id)) continue
          found = true
          if (normalizeThreadPreview(t.$raw).starred) anyStarred = true
        }
      }
    }
  }
  return found ? anyStarred : undefined
}

const UNDO_TOAST_DURATION_MS = 6_000

type RemovalAction = "archive" | "delete"

/**
 * Central optimistic thread actions. Rows vanish instantly (via the
 * backgroundQueue filter use-threads already applies), flags flip in place,
 * and only the active view's query key is invalidated once the server
 * confirms — never the blanket ["threads"] + ["allInboxes"] + ["thread"] trio.
 */
export function useThreadActions() {
  const queryClient = useQueryClient()
  const params = useParams<{ folder?: string }>()
  const pathname = usePathname()
  const isAllInboxes = pathname === "/mail/all-inboxes"
  const setBackgroundQueue = useSetAtom(backgroundQueueAtom)

  const folder = params?.folder ?? "inbox"
  const activeListKey = useMemo<QueryKey>(
    () => (isAllInboxes ? ["allInboxes"] : ["threads", folder]),
    [isAllInboxes, folder]
  )

  const invalidateActiveList = useCallback(
    () => queryClient.invalidateQueries({ queryKey: activeListKey }),
    [queryClient, activeListKey]
  )

  // Inactive caches (other folders, all-inboxes, search, open-thread details)
  // just get marked stale — they refetch on next mount, so this costs nothing
  // now but prevents removed rows resurfacing when the user switches views.
  const markOtherCachesStale = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["threads"],
      refetchType: "none",
    })
    void queryClient.invalidateQueries({
      queryKey: ["allInboxes"],
      refetchType: "none",
    })
    void queryClient.invalidateQueries({
      queryKey: ["search"],
      refetchType: "none",
    })
    void queryClient.invalidateQueries({
      queryKey: ["thread"],
      refetchType: "none",
    })
  }, [queryClient])

  const hideThreads = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        setBackgroundQueue({ type: "add", threadId: `thread:${id}` })
      }
    },
    [setBackgroundQueue]
  )

  const unhideThreads = useCallback(
    (ids: string[]) => {
      for (const id of ids) {
        setBackgroundQueue({ type: "delete", threadId: `thread:${id}` })
      }
    },
    [setBackgroundQueue]
  )

  const undoRemoval = useCallback(
    async (ids: string[], action: RemovalAction) => {
      try {
        // Clean server-side inverses: archive removed INBOX, delete added
        // TRASH. Re-adding INBOX on delete-undo only makes sense for threads
        // removed from an inbox view.
        if (action === "archive") {
          await modifyLabels(ids, ["INBOX"], [])
        } else {
          // Always restore to INBOX: removing TRASH alone is a no-op on the
          // IMAP transport and Microsoft driver (both are folder-based and
          // need a destination) — only Gmail can untrash by label removal.
          await modifyLabels(ids, ["INBOX"], ["TRASH"])
        }
        unhideThreads(ids)
        await invalidateActiveList()
        markOtherCachesStale()
      } catch {
        toast.error("Failed to undo")
      }
    },
    [unhideThreads, invalidateActiveList, markOtherCachesStale]
  )

  const removalMutation = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: RemovalAction }) =>
      action === "archive" ? bulkArchive(ids) : bulkDelete(ids),
    onMutate: async ({ ids }) => {
      await cancelListQueries(queryClient)
      hideThreads(ids)
    },
    onError: (_error, { ids, action }) => {
      unhideThreads(ids)
      toast.error(
        action === "archive" ? "Failed to archive" : "Failed to delete"
      )
    },
    onSuccess: (_data, { ids, action }) => {
      const noun = ids.length > 1 ? `${ids.length} threads` : "Thread"
      toast(action === "archive" ? `${noun} archived` : `${noun} deleted`, {
        duration: UNDO_TOAST_DURATION_MS,
        action: {
          label: "Undo",
          onClick: () => void undoRemoval(ids, action),
        },
      })
    },
    onSettled: async (_data, error, { ids }) => {
      if (error) return
      // Refetch just the active view, then release the queue entries so the
      // threads aren't hidden from other folders (e.g. Archive/Trash) forever.
      await invalidateActiveList()
      markOtherCachesStale()
      unhideThreads(ids)
    },
  })

  const flagMutation = useMutation({
    mutationFn: ({
      ids,
      kind,
      value,
    }: {
      ids: string[]
      kind: "star" | "read"
      value?: boolean
    }) => {
      if (kind === "star") return toggleStarServer(ids, value).then(() => {})
      const run = value ? markAsUnread(ids) : markAsRead(ids)
      return run.then(() => {})
    },
    onMutate: async ({ ids, kind, value }) => {
      await cancelListQueries(queryClient)
      const snapshot = snapshotLists(queryClient)
      if (kind === "star") {
        if (value !== undefined) {
          patchThreadPreviews(queryClient, ids, { starred: value })
        }
      } else {
        patchThreadPreviews(queryClient, ids, { unread: value })
      }
      return { snapshot }
    },
    onError: (_error, { kind }, context) => {
      if (context?.snapshot) restoreLists(queryClient, context.snapshot)
      toast.error(
        kind === "star" ? "Failed to update star" : "Failed to update thread"
      )
    },
    onSettled: () => {
      markOtherCachesStale()
      return invalidateActiveList()
    },
  })

  // Depend on the stable `.mutate` references (not the mutation result
  // objects, which change identity every render) so these callbacks stay
  // referentially stable for memoized rows.
  const mutateRemoval = removalMutation.mutate
  const mutateFlag = flagMutation.mutate

  const archive = useCallback(
    (threadIds: string[]) => {
      if (!threadIds.length) return
      mutateRemoval({ ids: threadIds, action: "archive" })
    },
    [mutateRemoval]
  )

  const deleteThreads = useCallback(
    (threadIds: string[]) => {
      if (!threadIds.length) return
      mutateRemoval({ ids: threadIds, action: "delete" })
    },
    [mutateRemoval]
  )

  /**
   * Silent + optimistic. Pass `starred` when the caller knows the desired
   * state (skips server-side reads); otherwise it's derived from the cache,
   * falling back to the server's own read-then-toggle.
   */
  const toggleStar = useCallback(
    (threadIds: string[], starred?: boolean) => {
      if (!threadIds.length) return
      let value = starred
      if (value === undefined) {
        const anyStarred = anyStarredInCache(queryClient, threadIds)
        if (anyStarred !== undefined) value = !anyStarred
      }
      mutateFlag({ ids: threadIds, kind: "star", value })
    },
    [mutateFlag, queryClient]
  )

  const markRead = useCallback(
    (threadIds: string[]) => {
      if (!threadIds.length) return
      mutateFlag({ ids: threadIds, kind: "read", value: false })
    },
    [mutateFlag]
  )

  const markUnread = useCallback(
    (threadIds: string[]) => {
      if (!threadIds.length) return
      mutateFlag({ ids: threadIds, kind: "read", value: true })
    },
    [mutateFlag]
  )

  return { archive, deleteThreads, toggleStar, markRead, markUnread }
}
