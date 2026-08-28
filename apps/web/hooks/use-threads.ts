"use client"

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { isThreadInBackgroundQueueAtom } from "@/store/backgroundQueue"
import { threadConnectionAtom } from "@/store/threadConnection"
import { useActiveConnection } from "@/hooks/use-connections"
import { useSearchValue } from "@/hooks/use-search-value"
import { useParams, usePathname } from "next/navigation"
import {
  listThreads,
  listAllInboxes,
  getThread as getThreadAction,
  markAsRead,
  processEmailContent,
} from "@/server/actions/mail"
import { extractThreadDate } from "@/lib/thread-utils"
import { patchThreadPreviews } from "@/hooks/use-thread-actions"
import {
  useInboxPreviewRows,
  useSyncThreadActions,
} from "@/hooks/use-thread-previews"
import { useAtomValue, useSetAtom } from "jotai"
import { useSettings } from "./use-settings"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { useQueryState } from "nuqs"

const STORE_PAGE_SIZE = 50

export const useThreads = () => {
  const { folder } = useParams<{ folder: string }>()
  const pathname = usePathname()
  const isAllInboxes = pathname === "/mail/all-inboxes"
  const [searchValue] = useSearchValue()
  const isInQueue = useAtomValue(isThreadInBackgroundQueueAtom)
  const { data: activeConnection } = useActiveConnection()
  const setThreadConnection = useSetAtom(threadConnectionAtom)

  // Local-first read path: the inbox list comes straight out of the synced
  // store — zero network on the paint path — whenever the store can serve
  // this view. Searches, other folders, and a still-backfilling store fall
  // through to the legacy live-fetch queries below.
  const [visibleCount, setVisibleCount] = useState(STORE_PAGE_SIZE)
  const storeEligible =
    !searchValue.value && (isAllInboxes || folder === "inbox")
  const storeRows = useInboxPreviewRows(
    isAllInboxes ? null : (activeConnection?.id ?? null),
    storeEligible ? visibleCount : 0
  )
  const usingStore = storeEligible && storeRows !== null

  const threadsQuery = useInfiniteQuery({
    queryKey: ["threads", folder, searchValue.value, activeConnection?.id],
    queryFn: ({ pageParam }) =>
      listThreads(folder, searchValue.value, undefined, pageParam ?? ""),
    enabled: !isAllInboxes && !!activeConnection && !usingStore,
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage?.nextPageToken ?? null,
    // Restored-from-IndexedDB pages are older than staleTime, so mounting
    // triggers one quiet background refetch — no explicit refetchOnMount and
    // no visible invalidation needed.
    staleTime: 60 * 1000,
  })

  const allInboxesQuery = useInfiniteQuery({
    queryKey: ["allInboxes"],
    queryFn: ({ pageParam }) => listAllInboxes(undefined, pageParam ?? ""),
    enabled: isAllInboxes && !usingStore,
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage?.nextPageToken ?? null,
    staleTime: 60 * 1000,
  })

  useEffect(() => {
    if (!isAllInboxes) return
    // The open-thread view resolves its connection through this map for
    // all-inboxes rows — feed it from whichever path is serving.
    const map: Record<string, string> = {}
    if (usingStore && storeRows) {
      for (const t of storeRows) map[t.id] = t.connectionId
    } else if (allInboxesQuery.data) {
      allInboxesQuery.data.pages
        .flatMap((p) => p.threads)
        .forEach((t: any) => {
          if (t.connectionId) map[t.id] = t.connectionId
        })
    }
    if (Object.keys(map).length > 0) {
      setThreadConnection((prev) => ({ ...prev, ...map }))
    }
  }, [isAllInboxes, usingStore, storeRows, allInboxesQuery.data, setThreadConnection])

  const activeQuery = isAllInboxes ? allInboxesQuery : threadsQuery

  const threads = useMemo(() => {
    if (usingStore && storeRows) {
      // Already newest-first from the store index; the background-queue
      // filter still applies so removals vanish on the very next frame.
      return storeRows.filter((t) => !isInQueue(`thread:${t.id}`))
    }
    if (!activeQuery.data) return []
    const filtered = activeQuery.data.pages
      .flatMap((e) => e.threads)
      .filter(Boolean)
      .filter((e) => !isInQueue(`thread:${e.id}`))
    return filtered.sort(
      (a, b) => extractThreadDate(b.$raw) - extractThreadDate(a.$raw)
    )
  }, [usingStore, storeRows, activeQuery.data, isInQueue])

  const loadMore = async () => {
    if (usingStore) {
      setVisibleCount((count) => count + STORE_PAGE_SIZE)
      return
    }
    if (activeQuery.isLoading || activeQuery.isFetchingNextPage) return
    await activeQuery.fetchNextPage()
  }

  return [activeQuery, threads, loadMore] as const
}

export const useThread = (
  threadId: string | null,
  options?: { enabled?: boolean }
) => {
  const { data: activeConnection } = useActiveConnection()
  const [queryThreadId] = useQueryState("threadId")
  const id = threadId ?? queryThreadId
  const { data: settings } = useSettings()
  const { resolvedTheme } = useTheme()
  const threadConnectionMap = useAtomValue(threadConnectionAtom)
  const connectionId = id ? threadConnectionMap[id] : undefined

  // Identity is proxy-validated before this tree renders; the only data gate
  // left is the active connection the query is keyed on.
  const isEnabled = (options?.enabled ?? true) && !!id && !!activeConnection

  const threadQuery = useQuery({
    queryKey: ["thread", id, connectionId],
    queryFn: () => getThreadAction(id!, connectionId),
    enabled: isEnabled,
    staleTime: 1000 * 60 * 60,
  })

  const { latestDraft, isGroupThread, finalData, latestMessage } =
    useMemo(() => {
      if (!threadQuery.data) {
        return {
          latestDraft: undefined,
          isGroupThread: false,
          finalData: undefined,
          latestMessage: undefined,
        }
      }

      const latestDraft = threadQuery.data.latest?.id
        ? threadQuery.data.messages.findLast((e) => e.isDraft)
        : undefined

      const isGroupThread = threadQuery.data.latest?.id
        ? [
            ...(threadQuery.data.latest.to || []),
            ...(threadQuery.data.latest.cc || []),
            ...(threadQuery.data.latest.bcc || []),
          ].length > 1
        : false

      const nonDraftMessages = threadQuery.data.messages.filter(
        (e) => !e.isDraft
      )
      const latestMessage = nonDraftMessages[nonDraftMessages.length - 1]

      const finalData = {
        ...threadQuery.data,
        messages: nonDraftMessages,
      }

      return { latestDraft, isGroupThread, finalData, latestMessage }
    }, [threadQuery.data])

  const shouldLoadImages = useMemo(() => {
    if (!settings?.settings || !latestMessage?.sender?.email) return false
    return !!(
      settings.settings.externalImages ||
      settings.settings.trustedSenders?.includes(latestMessage.sender.email)
    )
  }, [settings?.settings, latestMessage?.sender?.email])

  // Warms the exact cache entry MailContent reads: the key (including the
  // resolved theme) must match its query key verbatim, or this prefetch is
  // dead weight — it previously keyed on the raw theme value ("system"), so
  // the viewer never saw it and re-processed every message on open.
  useQuery({
    queryKey: [
      "email-content",
      latestMessage?.id,
      shouldLoadImages,
      resolvedTheme,
    ],
    queryFn: async () => {
      if (!latestMessage?.decodedBody || !settings?.settings) return null
      const result = await processEmailContent(
        latestMessage.decodedBody,
        shouldLoadImages,
        (resolvedTheme as "light" | "dark") || "light"
      )
      return {
        html: result.processedHtml,
        hasBlockedImages: result.hasBlockedImages,
      }
    },
    // Also gated on the resolved theme: before next-themes hydrates,
    // resolvedTheme is undefined and the fallback ("light") would sanitize —
    // and cache — under a key the viewer never reads once the real theme
    // resolves, doubling the work on cold open.
    enabled:
      !!latestMessage?.decodedBody &&
      !!settings?.settings &&
      resolvedTheme !== undefined,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  const queryClient = useQueryClient()
  const syncActions = useSyncThreadActions()
  const markedReadRef = useRef<string | null>(null)

  // Auto mark-as-read on open, honoring the user's autoRead setting. Waits
  // for settings to load rather than assuming; the schema defaults autoRead to
  // true so unset settings preserve the old behavior.
  const autoRead = settings?.settings?.autoRead ?? true

  useEffect(() => {
    if (!id || !threadQuery.data?.hasUnread || markedReadRef.current === id)
      return
    if (!settings || !autoRead) return

    markedReadRef.current = id
    // Flip the flag in place instead of refetching every loaded page.
    patchThreadPreviews(queryClient, [id], { unread: false })
    queryClient.setQueryData(
      ["thread", id, connectionId],
      (old: typeof threadQuery.data) =>
        old ? { ...old, hasUnread: false } : old
    )
    // Local-first path: an optimistic store transaction + durable MailOp;
    // otherwise the legacy direct server action.
    if (syncActions?.markRead([id])) return
    markAsRead([id], connectionId).catch(() => {
      markedReadRef.current = null
      patchThreadPreviews(queryClient, [id], { unread: true })
    })
  }, [
    id,
    threadQuery.data?.hasUnread,
    connectionId,
    queryClient,
    settings,
    autoRead,
    syncActions,
  ])

  return { ...threadQuery, data: finalData, isGroupThread, latestDraft }
}
