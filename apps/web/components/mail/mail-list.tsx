"use client"

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
      const raw = thread.$raw as
        | {
            preview?: {
              sender?: { name?: string; email?: string }
              subject?: string
              receivedOn?: string
              unread?: boolean
            }
          }
        | undefined
      const sender = (raw?.preview?.sender as {
        name?: string
        email?: string
      }) ?? {
        email: "unknown",
      }
      const subject = (raw?.preview?.subject as string) ?? "(no subject)"
      const date = (raw?.preview?.receivedOn as string) ?? ""
      const unread = (raw?.preview?.unread as boolean) ?? false
      const isSelected = threadId === thread.id

      console.log("thread", thread)

      return (
        <>
          <MailListRow
            title={sender.name || sender.email || "Unknown"}
            subtitle={subject}
            date={date ? formatDate(date) : undefined}
            unread={unread}
            selected={isSelected}
            avatarEmail={sender.email}
            avatarName={sender.name}
            onClick={() => {
              setThreadId(thread.id)
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
    [threads.length, query.isFetchingNextPage, setThreadId, threadId]
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
