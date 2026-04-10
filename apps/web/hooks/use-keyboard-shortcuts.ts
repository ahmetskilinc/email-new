"use client"

import { useEffect } from "react"
import { useQueryState } from "nuqs"
import { useQueryClient } from "@tanstack/react-query"
import { useThreads } from "@/hooks/use-threads"
import { useReplyActions } from "@/hooks/use-reply-actions"
import { useOpenCompose } from "@/store/compose"
import {
  bulkArchive,
  bulkDelete,
  toggleStar,
  markAsRead,
  markAsUnread,
} from "@/server/actions/mail"
import { toast } from "sonner"

function isTyping(): boolean {
  const el = document.activeElement
  if (!el) return false
  const tag = el.tagName.toLowerCase()
  if (tag === "input" || tag === "textarea" || tag === "select") return true
  if ((el as HTMLElement).isContentEditable) return true
  return false
}

export function useKeyboardShortcuts() {
  const [threadId, setThreadId] = useQueryState("threadId")
  const [, threads] = useThreads()
  const { handleReply, handleReplyAll, handleForward } =
    useReplyActions(threadId)
  const openCompose = useOpenCompose()
  const queryClient = useQueryClient()

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] })
      queryClient.invalidateQueries({ queryKey: ["allInboxes"] })
      queryClient.invalidateQueries({ queryKey: ["thread"] })
    }

    const handler = (e: KeyboardEvent) => {
      if (isTyping()) return

      const key = e.key

      // Navigation
      if (key === "j" || key === "k") {
        e.preventDefault()
        if (threads.length === 0) return
        const currentIndex = threadId
          ? threads.findIndex((t) => t.id === threadId)
          : -1
        const nextIndex =
          key === "j"
            ? Math.min(currentIndex + 1, threads.length - 1)
            : Math.max(currentIndex - 1, 0)
        void setThreadId(threads[nextIndex]!.id)
        return
      }

      // Compose
      if (key === "c") {
        e.preventDefault()
        openCompose()
        return
      }

      // Reply / Reply All / Forward (require selected thread)
      if (key === "r" && !e.shiftKey) {
        e.preventDefault()
        handleReply()
        return
      }
      if (key === "a") {
        e.preventDefault()
        handleReplyAll()
        return
      }
      if (key === "f") {
        e.preventDefault()
        handleForward()
        return
      }

      // Archive
      if (key === "e" && threadId) {
        e.preventDefault()
        const idx = threads.findIndex((t) => t.id === threadId)
        const next = threads[idx + 1] ?? threads[idx - 1]
        void setThreadId(next?.id ?? null)
        toast.promise(
          bulkArchive([threadId]).then(() => invalidate()),
          {
            loading: "Archiving...",
            success: "Archived",
            error: "Failed to archive",
          },
        )
        return
      }

      // Delete
      if (key === "#" && threadId) {
        e.preventDefault()
        const idx = threads.findIndex((t) => t.id === threadId)
        const next = threads[idx + 1] ?? threads[idx - 1]
        void setThreadId(next?.id ?? null)
        toast.promise(
          bulkDelete([threadId]).then(() => invalidate()),
          {
            loading: "Deleting...",
            success: "Deleted",
            error: "Failed to delete",
          },
        )
        return
      }

      // Star
      if (key === "s" && threadId) {
        e.preventDefault()
        toast.promise(
          toggleStar([threadId]).then(() => invalidate()),
          {
            loading: "Updating...",
            success: "Star toggled",
            error: "Failed to toggle star",
          },
        )
        return
      }

      // Toggle read/unread
      if (key === "u" && threadId) {
        e.preventDefault()
        if (e.shiftKey) {
          toast.promise(
            markAsUnread([threadId]).then(() => invalidate()),
            {
              loading: "Updating...",
              success: "Marked as unread",
              error: "Failed to mark as unread",
            },
          )
        } else {
          toast.promise(
            markAsRead([threadId]).then(() => invalidate()),
            {
              loading: "Updating...",
              success: "Marked as read",
              error: "Failed to mark as read",
            },
          )
        }
        return
      }

      // Escape — deselect
      if (key === "Escape") {
        e.preventDefault()
        void setThreadId(null)
        return
      }

      // Focus search
      if (key === "/") {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>(
          '[data-slot="search-input"]',
        )
        input?.focus()
        return
      }
    }

    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [
    threadId,
    threads,
    setThreadId,
    handleReply,
    handleReplyAll,
    handleForward,
    openCompose,
    queryClient,
  ])
}
