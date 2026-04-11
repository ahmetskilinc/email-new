"use client"

import { useInfiniteQuery } from "@tanstack/react-query"
import { useActiveConnection } from "@/hooks/use-connections"
import { searchMail } from "@/server/actions/mail"
import { extractThreadDate } from "@/lib/thread-utils"
import { useMemo } from "react"

export interface SearchParams {
  q: string
  from?: string
  after?: string
  before?: string
  hasAttachment?: boolean
  folder?: string
}

export function useSearchResults(params: SearchParams) {
  const { data: activeConnection } = useActiveConnection()
  const hasQuery =
    params.q.length > 0 ||
    !!params.from ||
    !!params.after ||
    !!params.before ||
    !!params.hasAttachment

  const query = useInfiniteQuery({
    queryKey: ["search", params, activeConnection?.id],
    queryFn: ({ pageParam }) =>
      searchMail({ ...params, cursor: pageParam ?? "" }),
    enabled: hasQuery && !!activeConnection,
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage?.nextPageToken ?? null,
    staleTime: 60 * 1000,
  })

  const threads = useMemo(() => {
    if (!query.data) return []
    return query.data.pages
      .flatMap((p) => p.threads)
      .filter(Boolean)
      .sort((a, b) => extractThreadDate(b.$raw) - extractThreadDate(a.$raw))
  }, [query.data])

  const loadMore = async () => {
    if (query.isLoading || query.isFetchingNextPage) return
    await query.fetchNextPage()
  }

  return { query, threads, loadMore }
}
