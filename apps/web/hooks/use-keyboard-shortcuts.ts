"use client"

import { useEffect, useRef } from "react"
import { useQueryState } from "nuqs"
import { useAtom, useSetAtom } from "jotai"
import { useThreads } from "@/hooks/use-threads"
import { useThreadActions } from "@/hooks/use-thread-actions"
import { useReplyActions } from "@/hooks/use-reply-actions"
import { focusedIndexAtom } from "@/hooks/use-mail-navigation"
import { useOpenCompose } from "@/store/compose"
import { useCommandPalette } from "@/store/command-palette"
import { shortcutsHelpOpenAtom } from "@/components/shortcuts-help"
import { useSelectedThreadIds, useSelectionActions } from "@/store/selection"

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
  const [, setCommandPaletteOpen] = useCommandPalette()
  const setShortcutsHelpOpen = useSetAtom(shortcutsHelpOpenAtom)
  const selectedIds = useSelectedThreadIds()
  const { clearAll: clearSelection } = useSelectionActions()
  const [focusedIndex, setFocusedIndex] = useAtom(focusedIndexAtom)
  const actions = useThreadActions()

  // Everything volatile lives in a ref so the keydown listener is subscribed
  // exactly once instead of being torn down on every render.
  const stateRef = useRef({
    threadId,
    setThreadId,
    threads,
    handleReply,
    handleReplyAll,
    handleForward,
    openCompose,
    setCommandPaletteOpen,
    setShortcutsHelpOpen,
    selectedIds,
    clearSelection,
    focusedIndex,
    setFocusedIndex,
    actions,
  })

  useEffect(() => {
    stateRef.current = {
      threadId,
      setThreadId,
      threads,
      handleReply,
      handleReplyAll,
      handleForward,
      openCompose,
      setCommandPaletteOpen,
      setShortcutsHelpOpen,
      selectedIds,
      clearSelection,
      focusedIndex,
      setFocusedIndex,
      actions,
    }
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const s = stateRef.current

      // Command palette — works even when typing
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        s.setCommandPaletteOpen((prev) => !prev)
        return
      }

      if (isTyping()) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const key = e.key

      // Targets for bulk-aware actions: checkbox selection wins, then the
      // open thread, then the keyboard cursor.
      const focusedThread =
        s.focusedIndex !== null ? s.threads[s.focusedIndex] : undefined
      const targets =
        s.selectedIds.size > 0
          ? Array.from(s.selectedIds)
          : s.threadId
            ? [s.threadId]
            : focusedThread
              ? [focusedThread.id]
              : null

      // Advances the open thread (when it's being acted on) and keeps the
      // cursor in place so it lands on the following row once this one is
      // optimistically removed.
      const advancePastRemoved = () => {
        if (s.selectedIds.size === 0 && s.threadId) {
          const idx = s.threads.findIndex((t) => t.id === s.threadId)
          const next = s.threads[idx + 1] ?? s.threads[idx - 1]
          void s.setThreadId(next?.id ?? null)
        }
        if (s.focusedIndex !== null) {
          const clamped = Math.min(s.focusedIndex, s.threads.length - 2)
          s.setFocusedIndex(clamped < 0 ? null : clamped)
        }
      }

      // Cursor movement — j/k move focus WITHOUT opening or marking read
      if (key === "j" || key === "k") {
        e.preventDefault()
        if (s.threads.length === 0) return
        const base =
          s.focusedIndex ??
          (s.threadId ? s.threads.findIndex((t) => t.id === s.threadId) : -1)
        const next =
          key === "j"
            ? Math.min(base + 1, s.threads.length - 1)
            : Math.max(base - 1, 0)
        s.setFocusedIndex(next)
        return
      }

      // Open focused thread
      if (key === "Enter" || key === "o") {
        const target = e.target as HTMLElement | null
        // Don't hijack Enter aimed at buttons/links/dialogs
        if (key === "Enter" && target?.closest?.("button, a, [role='dialog']"))
          return
        if (!focusedThread) return
        e.preventDefault()
        void s.setThreadId(focusedThread.id)
        return
      }

      // Compose
      if (key === "c") {
        e.preventDefault()
        s.openCompose()
        return
      }

      // Reply / Reply All / Forward (require selected thread)
      if (key === "r" && !e.shiftKey) {
        e.preventDefault()
        s.handleReply()
        return
      }
      if (key === "a") {
        e.preventDefault()
        s.handleReplyAll()
        return
      }
      if (key === "f") {
        e.preventDefault()
        s.handleForward()
        return
      }

      // Archive (bulk-aware, optimistic with undo)
      if (key === "e") {
        if (!targets) return
        e.preventDefault()
        advancePastRemoved()
        s.actions.archive(targets)
        s.clearSelection()
        return
      }

      // Delete (bulk-aware, optimistic with undo)
      if (key === "#") {
        if (!targets) return
        e.preventDefault()
        advancePastRemoved()
        s.actions.deleteThreads(targets)
        s.clearSelection()
        return
      }

      // Star (bulk-aware, silent + optimistic)
      if (key === "s") {
        if (!targets) return
        e.preventDefault()
        s.actions.toggleStar(targets)
        s.clearSelection()
        return
      }

      // Toggle read/unread (bulk-aware, optimistic)
      if (key === "u" || key === "U") {
        if (!targets) return
        e.preventDefault()
        if (e.shiftKey) s.actions.markUnread(targets)
        else s.actions.markRead(targets)
        s.clearSelection()
        return
      }

      // Shortcuts help
      if (key === "?") {
        e.preventDefault()
        s.setShortcutsHelpOpen(true)
        return
      }

      // Escape — close thread, then clear selection, then clear cursor
      if (key === "Escape") {
        e.preventDefault()
        if (s.threadId) {
          void s.setThreadId(null)
        } else if (s.selectedIds.size > 0) {
          s.clearSelection()
        } else if (s.focusedIndex !== null) {
          s.setFocusedIndex(null)
        }
        return
      }

      // Focus search
      if (key === "/") {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>(
          '[data-slot="search-input"]'
        )
        input?.focus()
        return
      }
    }

    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])
}
