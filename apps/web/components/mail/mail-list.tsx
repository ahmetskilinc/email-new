"use client"

import { normalizeThreadPreview } from "@/lib/thread-utils"
import {
  useSelectedThreadIds,
  useSelectionActions,
} from "@/store/selection"
import { toggleStar } from "@/server/actions/mail"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { MailListRow } from "@/components/mail/mail-list-row"
import { useThreads } from "@/hooks/use-threads"
import { VList, type VListHandle } from "virtua"
import { formatDate } from "@/lib/utils"
import { useCallback, useRef } from "react"
import { useQueryState } from "nuqs"

function MailListSpinner() {
  return (
    <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white dark:border-t-transparent" />
  )
}

export function MailList() {
  const [query, threads, loadMore] = useThreads()
  const [threadId, setThreadId] = useQueryState("threadId")
  const vListRef = useRef<VListHandle>(null)
  const selectedIds = useSelectedThreadIds()
  const { toggle: toggleSelection } = useSelectionActions()
  const anyChecked = selectedIds.size > 0
  const queryClient = useQueryClient()

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
    [
      threads.length,
      query.isLoading,
      query.isFetchingNextPage,
      query.hasNextPage,
      loadMore,
    ]
  )

  const renderItem = useCallback(
    (thread: (typeof threads)[number], index: number) => {
      const { sender, subject, receivedOn, unread, starred } =
        normalizeThreadPreview(thread.$raw)
      const isSelected = threadId === thread.id

      return (
        <>
          <MailListRow
            title={sender.name || sender.email || "Unknown"}
            subtitle={subject}
            date={receivedOn ? formatDate(receivedOn) : undefined}
            unread={unread}
            starred={starred}
            selected={isSelected}
            checked={selectedIds.has(thread.id)}
            anyChecked={anyChecked}
            avatarEmail={sender.email}
            avatarName={sender.name}
            onClick={() => {
              setThreadId(thread.id)
            }}
            onCheckChange={() => toggleSelection(thread.id)}
            onStarToggle={() => {
              toast.promise(
                toggleStar([thread.id]).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["threads"] })
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
              <MailListSpinner />
            </div>
          )}
        </>
      )
    },
    [threads.length, query.isFetchingNextPage, setThreadId, threadId, selectedIds, anyChecked, toggleSelection, queryClient]
  )

  if (query.isLoading) {
    return (
      <div className="flex flex-col">
        {Array.from({ length: 8 }).map((_, i) => (
          <MailListRow key={i} loading title="" subtitle="" />
        ))}
      </div>
    )
  }

  if (threads.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="text-sm text-muted-foreground">No messages found</p>
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
}
