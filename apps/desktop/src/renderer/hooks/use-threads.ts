import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams, useLocation } from "react-router-dom"
import { useActiveConnection } from "./use-connections"
import { useSettings } from "./use-settings"
import { useTheme } from "../providers/theme-provider"
import { useState } from "react"

export const useThreads = () => {
  const { folder } = useParams<{ folder: string }>()
  const location = useLocation()
  const isAllInboxes = location.pathname.includes("all-inboxes")
  const [searchValue] = useState("")
  const { data: activeConnection } = useActiveConnection()

  const threadsQuery = useInfiniteQuery({
    queryKey: ["threads", folder, searchValue, activeConnection?.id],
    queryFn: ({ pageParam }) =>
      window.api.mail.listThreads(
        folder ?? "inbox",
        searchValue || undefined,
        undefined,
        pageParam ?? "",
      ),
    enabled: !isAllInboxes && !!activeConnection,
    initialPageParam: "",
    getNextPageParam: (lastPage: any) => lastPage?.nextPageToken ?? null,
    staleTime: 60 * 1000,
    refetchOnMount: true,
  })

  const allInboxesQuery = useInfiniteQuery({
    queryKey: ["allInboxes"],
    queryFn: ({ pageParam }) =>
      window.api.mail.listAllInboxes(undefined, pageParam ?? ""),
    enabled: isAllInboxes,
    initialPageParam: "",
    getNextPageParam: (lastPage: any) => lastPage?.nextPageToken ?? null,
    staleTime: 60 * 1000,
  })

  const activeQuery = isAllInboxes ? allInboxesQuery : threadsQuery

  const threads =
    activeQuery.data?.pages.flatMap((page: any) => page?.threads ?? []) ?? []

  return {
    threads,
    isLoading: activeQuery.isLoading,
    isFetchingNextPage: activeQuery.isFetchingNextPage,
    hasNextPage: activeQuery.hasNextPage,
    fetchNextPage: activeQuery.fetchNextPage,
    error: activeQuery.error,
    refetch: activeQuery.refetch,
  }
}

export const useThread = (threadId: string | null, connectionId?: string) => {
  const { resolvedTheme } = useTheme()
  const { data: settings } = useSettings()
  const shouldLoadImages = settings?.externalImages ?? true

  return useQuery({
    queryKey: ["thread", threadId, connectionId],
    queryFn: async () => {
      if (!threadId) return null
      const thread = await window.api.mail.getThread(threadId, connectionId)

      // Process email HTML for each message
      if (thread?.messages) {
        const processedMessages = await Promise.all(
          thread.messages.map(async (msg: any) => {
            if (msg.body) {
              const { processedHtml } = await window.api.mail.processEmailContent(
                msg.body,
                shouldLoadImages,
                resolvedTheme as "light" | "dark",
              )
              return { ...msg, processedHtml }
            }
            return msg
          }),
        )
        return { ...thread, messages: processedMessages }
      }

      return thread
    },
    enabled: !!threadId,
    staleTime: 30 * 1000,
  })
}
