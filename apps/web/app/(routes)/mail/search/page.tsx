"use client"

import { useState, useCallback, useEffect, useMemo } from "react"
import { useQueryState } from "nuqs"
import { useQueryClient } from "@tanstack/react-query"
import { useMailLayout } from "@/hooks/use-mail-layout"
import { useSearchResults, type SearchParams } from "@/hooks/use-search"
import { SearchFilters } from "@/components/mail/search-filters"
import { MailDisplay } from "@/components/mail/mail-display"
import { MailListRow } from "@/components/mail/mail-list-row"
import { normalizeThreadPreview } from "@/lib/thread-utils"
import { formatDate } from "@/lib/utils"
import { toggleStar } from "@/server/actions/mail"
import { VList, type VListHandle } from "virtua"
import {
  Sheet,
  SheetContent,
  SheetClose,
} from "@workspace/ui/components/sheet"
import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon } from "@hugeicons-pro/core-stroke-rounded"
import { toast } from "sonner"
import { useRef } from "react"

export const dynamic = "force-dynamic"

export default function SearchPage() {
  const savedLayout = useMailLayout()
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)")
    setIsMobile(mql.matches)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])
  const layout = isMobile ? "centered" : savedLayout

  const [threadId, setThreadId] = useQueryState("threadId")
  const [params, setParams] = useState<SearchParams>({ q: "" })
  const { query, threads, loadMore } = useSearchResults(params)
  const queryClient = useQueryClient()
  const vListRef = useRef<VListHandle>(null)

  const hasSearched =
    params.q.length > 0 ||
    !!params.from ||
    !!params.after ||
    !!params.before ||
    !!params.hasAttachment

  const handleScroll = useCallback(
    (scrollOffset: number) => {
      const h = vListRef.current
      if (!h) return
      const endIndex = h.findItemIndex(scrollOffset + h.viewportSize - 1)
      if (
        Math.abs(threads.length - 1 - endIndex) < 7 &&
        !query.isLoading &&
        !query.isFetchingNextPage &&
        query.hasNextPage
      ) {
        void loadMore()
      }
    },
    [threads.length, query.isLoading, query.isFetchingNextPage, query.hasNextPage, loadMore],
  )

  const renderItem = useCallback(
    (thread: (typeof threads)[number], index: number) => {
      const { sender, subject, receivedOn, unread, starred } =
        normalizeThreadPreview(thread.$raw)
      const isSelected = threadId === thread.id

      return (
        <>
          <MailListRow
            layout={layout}
            title={sender.name || sender.email || "Unknown"}
            subtitle={subject}
            date={receivedOn ? formatDate(receivedOn) : undefined}
            unread={unread}
            starred={starred}
            selected={isSelected}
            onClick={() => setThreadId(thread.id)}
            onStarToggle={() => {
              toast.promise(
                toggleStar([thread.id]).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["search"] })
                  queryClient.invalidateQueries({ queryKey: ["thread"] })
                }),
                {
                  loading: "Updating...",
                  success: starred ? "Unstarred" : "Starred",
                  error: "Failed to toggle star",
                },
              )
            }}
          />
          {index === threads.length - 1 && query.isFetchingNextPage && (
            <div className="flex w-full justify-center py-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white dark:border-t-transparent" />
            </div>
          )}
        </>
      )
    },
    [threads.length, query.isFetchingNextPage, setThreadId, threadId, queryClient, layout],
  )

  const resultsList = useMemo(() => {
    if (query.isLoading) {
      return (
        <div className="flex flex-col">
          {Array.from({ length: 6 }).map((_, i) => (
            <MailListRow key={i} loading title="" subtitle="" />
          ))}
        </div>
      )
    }

    if (!hasSearched) {
      return (
        <div className="flex h-full items-center justify-center p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Enter a search query to find emails
          </p>
        </div>
      )
    }

    if (threads.length === 0) {
      return (
        <div className="flex h-full items-center justify-center p-8 text-center">
          <p className="text-sm text-muted-foreground">No results found</p>
        </div>
      )
    }

    return (
      <VList
        ref={vListRef}
        data={threads}
        bufferSize={500}
        itemSize={100}
        className="h-full flex-1 overflow-x-hidden"
        onScroll={handleScroll}
      >
        {renderItem}
      </VList>
    )
  }, [query.isLoading, hasSearched, threads, handleScroll, renderItem])

  if (layout === "centered") {
    return (
      <div className="flex h-full w-full justify-center">
        <div className="flex w-full max-w-5xl flex-col">
          <SearchFilters onSearch={setParams} isLoading={query.isLoading} />
          <div className="min-h-0 flex-1">{resultsList}</div>
        </div>
        <Sheet
          open={!!threadId}
          onOpenChange={(open) => {
            if (!open) setThreadId(null)
          }}
        >
          <SheetContent
            side="right"
            className="w-full p-0 sm:w-3/4 sm:max-w-3xl lg:min-w-4xl"
            showCloseButton={false}
          >
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 sm:hidden">
              <SheetClose
                render={<Button variant="ghost" size="icon-sm" />}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
                <span className="sr-only">Back</span>
              </SheetClose>
              <span className="truncate text-sm font-medium">Back to results</span>
            </div>
            <MailDisplay className="max-h-full" />
          </SheetContent>
        </Sheet>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full">
      <div className="flex w-full max-w-sm shrink-0 flex-col border-r">
        <SearchFilters onSearch={setParams} isLoading={query.isLoading} />
        <div className="min-h-0 flex-1">{resultsList}</div>
      </div>
      <div className="min-w-0 flex-1">
        <MailDisplay />
      </div>
    </div>
  )
}
