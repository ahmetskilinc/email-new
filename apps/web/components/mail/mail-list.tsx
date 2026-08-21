"use client"

import { normalizeThreadPreview, type ThreadPreview } from "@/lib/thread-utils"
import {
  useAnySelected,
  useIsThreadSelected,
  useSelectionActions,
} from "@/store/selection"
import { MailListRow } from "@/components/mail/mail-list-row"
import { useThreads } from "@/hooks/use-threads"
import { useThreadActions } from "@/hooks/use-thread-actions"
import { focusedIndexAtom } from "@/hooks/use-mail-navigation"
import { VList, type VListHandle } from "virtua"
import { formatDate } from "@/lib/utils"
import { memo, useCallback, useEffect, useRef } from "react"
import { useAtom } from "jotai"
import { useQueryState } from "nuqs"

function MailListSpinner() {
  return (
    <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-900 border-t-transparent dark:border-white dark:border-t-transparent" />
  )
}

type ThreadItem = { id: string; $raw?: unknown }

// Per-row wrapper: subscribes to its own selection state so toggling a
// checkbox re-renders only the affected rows, not the whole list via
// renderItem's dependency on the selection Set.
const MailListItem = memo(function MailListItem({
  thread,
  layout,
  selected,
  focused,
  onOpen,
  onStarToggle,
}: {
  thread: ThreadItem
  layout: "split" | "centered"
  selected: boolean
  focused: boolean
  onOpen: (id: string) => void
  onStarToggle: (id: string, starred: boolean) => void
}) {
  const checked = useIsThreadSelected(thread.id)
  const anyChecked = useAnySelected()
  const { toggle: toggleSelection } = useSelectionActions()

  const preview = normalizeThreadPreview(thread.$raw)
  const { sender, subject, receivedOn, unread, starred } = preview
  const snippet = preview.snippet
  const hasAttachments = preview.hasAttachments

  return (
    <div
      data-focused={focused || undefined}
      className={focused ? "bg-accent/50" : undefined}
    >
      <MailListRow
        layout={layout}
        title={sender.name || sender.email || "Unknown"}
        subtitle={subject}
        {...(snippet !== undefined ? { snippet } : {})}
        {...(hasAttachments !== undefined ? { hasAttachments } : {})}
        date={receivedOn ? formatDate(receivedOn) : undefined}
        unread={unread}
        starred={starred}
        selected={selected}
        checked={checked}
        anyChecked={anyChecked}
        avatarEmail={sender.email}
        avatarName={sender.name}
        onClick={() => onOpen(thread.id)}
        onCheckChange={() => toggleSelection(thread.id)}
        onStarToggle={() => onStarToggle(thread.id, !starred)}
      />
    </div>
  )
})

export function MailList({
  layout = "split",
}: {
  layout?: "split" | "centered"
}) {
  const [query, threads, loadMore] = useThreads()
  const [threadId, setThreadId] = useQueryState("threadId")
  const vListRef = useRef<VListHandle>(null)
  const [focusedIndex, setFocusedIndex] = useAtom(focusedIndexAtom)
  const { toggleStar } = useThreadActions()

  // Keep the keyboard cursor visible as it moves.
  useEffect(() => {
    if (focusedIndex === null) return
    if (focusedIndex < 0 || focusedIndex >= threads.length) return
    vListRef.current?.scrollToIndex(focusedIndex, { align: "nearest" })
  }, [focusedIndex, threads.length])

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

  const handleOpen = useCallback(
    (id: string) => {
      void setThreadId(id)
    },
    [setThreadId]
  )

  const handleStarToggle = useCallback(
    (id: string, starred: boolean) => {
      // Silent + optimistic; the explicit state skips server-side reads.
      toggleStar([id], starred)
    },
    [toggleStar]
  )

  const renderItem = useCallback(
    (thread: (typeof threads)[number], index: number) => (
      <>
        <MailListItem
          thread={thread}
          layout={layout}
          selected={threadId === thread.id}
          focused={focusedIndex === index}
          onOpen={handleOpen}
          onStarToggle={handleStarToggle}
        />
        {index === threads.length - 1 && query.isFetchingNextPage && (
          <div className="flex w-full justify-center py-4">
            <MailListSpinner />
          </div>
        )}
      </>
    ),
    [
      threads.length,
      query.isFetchingNextPage,
      layout,
      threadId,
      focusedIndex,
      handleOpen,
      handleStarToggle,
    ]
  )

  // Sync the keyboard cursor when a row is opened by click, so j/k continue
  // from the opened thread.
  useEffect(() => {
    if (!threadId) return
    const idx = threads.findIndex((t) => t.id === threadId)
    if (idx !== -1) setFocusedIndex(idx)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

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
