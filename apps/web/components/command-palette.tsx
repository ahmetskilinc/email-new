"use client"

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { useCommandPalette } from "@/store/command-palette"
import { useOpenCompose } from "@/store/compose"
import { useConnections, useActiveConnection } from "@/hooks/use-connections"
import {
  navigationConfig,
  navigationConfigTopNav,
} from "@/config/navigation"
import { listThreads } from "@/server/actions/mail"
import { setDefaultConnection } from "@/server/actions/connections"
import {
  bulkArchive,
  bulkDelete,
  toggleStar,
  markAsRead,
  markAsUnread,
} from "@/server/actions/mail"
import { normalizeThreadPreview } from "@/lib/thread-utils"
import { useRouter } from "next/navigation"
import { useQueryState } from "nuqs"
import { useQueryClient } from "@tanstack/react-query"
import { useTheme } from "next-themes"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

interface CommandEntry {
  id: string
  label: string
  description?: string
  group: string
  shortcut?: string
  onSelect: () => void
}

export function CommandPalette() {
  const [open, setOpen] = useCommandPalette()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [searchResults, setSearchResults] = useState<CommandEntry[]>([])
  const [searching, setSearching] = useState(false)
  const router = useRouter()
  const openCompose = useOpenCompose()
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const [threadId, setThreadId] = useQueryState("threadId")
  const queryClient = useQueryClient()
  const { theme, setTheme } = useTheme()
  const { data: connectionsData } = useConnections()
  const { data: activeConnection } = useActiveConnection()
  const connections = connectionsData?.connections ?? []

  const close = useCallback(() => {
    setOpen(false)
    setQuery("")
    setActiveIndex(0)
    setSearchResults([])
  }, [setOpen])

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["threads"] })
    queryClient.invalidateQueries({ queryKey: ["allInboxes"] })
    queryClient.invalidateQueries({ queryKey: ["thread"] })
  }, [queryClient])

  // Search threads when query is 3+ chars
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.length < 3) {
      setSearchResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    let cancelled = false
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await listThreads("inbox", query, 5)
        if (cancelled) return
        const entries: CommandEntry[] = (result.threads ?? []).map((t) => {
          const preview = normalizeThreadPreview(t.$raw)
          return {
            id: `thread-${t.id}`,
            label: preview.sender.name || preview.sender.email || "Unknown",
            description: preview.subject,
            group: "Emails",
            onSelect: () => {
              router.push(`/mail/inbox?threadId=${t.id}`)
              close()
            },
          }
        })
        setSearchResults(entries)
      } catch {
        if (!cancelled) setSearchResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)

    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, router, close])

  const staticEntries = useMemo<CommandEntry[]>(() => {
    const entries: CommandEntry[] = []

    // Context-aware actions (when a thread is selected)
    if (threadId) {
      entries.push(
        {
          id: "ctx-archive",
          label: "Archive this thread",
          group: "Current Thread",
          shortcut: "e",
          onSelect: () => {
            toast.promise(
              bulkArchive([threadId]).then(() => {
                invalidate()
                void setThreadId(null)
              }),
              { loading: "Archiving...", success: "Archived", error: "Failed" },
            )
            close()
          },
        },
        {
          id: "ctx-delete",
          label: "Delete this thread",
          group: "Current Thread",
          shortcut: "#",
          onSelect: () => {
            toast.promise(
              bulkDelete([threadId]).then(() => {
                invalidate()
                void setThreadId(null)
              }),
              { loading: "Deleting...", success: "Deleted", error: "Failed" },
            )
            close()
          },
        },
        {
          id: "ctx-star",
          label: "Star this thread",
          group: "Current Thread",
          shortcut: "s",
          onSelect: () => {
            toast.promise(
              toggleStar([threadId]).then(() => invalidate()),
              { loading: "Updating...", success: "Star toggled", error: "Failed" },
            )
            close()
          },
        },
        {
          id: "ctx-read",
          label: "Mark as read",
          group: "Current Thread",
          shortcut: "u",
          onSelect: () => {
            toast.promise(
              markAsRead([threadId]).then(() => invalidate()),
              { loading: "Updating...", success: "Marked as read", error: "Failed" },
            )
            close()
          },
        },
        {
          id: "ctx-unread",
          label: "Mark as unread",
          group: "Current Thread",
          onSelect: () => {
            toast.promise(
              markAsUnread([threadId]).then(() => invalidate()),
              { loading: "Updating...", success: "Marked as unread", error: "Failed" },
            )
            close()
          },
        },
      )
    }

    // Navigation
    for (const item of [...navigationConfig, ...navigationConfigTopNav]) {
      entries.push({
        id: `nav-${item.id}`,
        label: item.title,
        group: "Navigation",
        onSelect: () => {
          router.push(item.href)
          close()
        },
      })
    }

    // Actions
    entries.push(
      {
        id: "action-compose",
        label: "Compose new email",
        group: "Actions",
        shortcut: "c",
        onSelect: () => {
          openCompose()
          close()
        },
      },
      {
        id: "action-search",
        label: "Focus search",
        group: "Actions",
        shortcut: "/",
        onSelect: () => {
          close()
          setTimeout(() => {
            document
              .querySelector<HTMLInputElement>('[data-slot="search-input"]')
              ?.focus()
          }, 100)
        },
      },
    )

    // Account switcher
    if (connections.length > 1) {
      for (const conn of connections) {
        if (conn.id === activeConnection?.id) continue
        entries.push({
          id: `account-${conn.id}`,
          label: `Switch to ${conn.email}`,
          group: "Accounts",
          onSelect: async () => {
            try {
              await setDefaultConnection(conn.id)
              queryClient.invalidateQueries({ queryKey: ["activeConnection"] })
              queryClient.invalidateQueries({ queryKey: ["threads"] })
              queryClient.invalidateQueries({ queryKey: ["allInboxes"] })
              toast.success(`Switched to ${conn.email}`)
            } catch {
              toast.error("Failed to switch account")
            }
            close()
          },
        })
      }
    }

    // Theme
    entries.push(
      {
        id: "theme-light",
        label: "Switch to light mode",
        group: "Appearance",
        onSelect: () => {
          setTheme("light")
          close()
        },
      },
      {
        id: "theme-dark",
        label: "Switch to dark mode",
        group: "Appearance",
        onSelect: () => {
          setTheme("dark")
          close()
        },
      },
      {
        id: "theme-system",
        label: "Use system theme",
        group: "Appearance",
        onSelect: () => {
          setTheme("system")
          close()
        },
      },
    )

    // Settings
    entries.push(
      {
        id: "settings-general",
        label: "Settings: General",
        group: "Settings",
        onSelect: () => close(),
      },
      {
        id: "settings-signatures",
        label: "Settings: Signatures",
        group: "Settings",
        onSelect: () => close(),
      },
      {
        id: "settings-notifications",
        label: "Settings: Notifications",
        group: "Settings",
        onSelect: () => close(),
      },
    )

    return entries
  }, [
    threadId,
    connections,
    activeConnection?.id,
    router,
    openCompose,
    setTheme,
    setThreadId,
    invalidate,
    queryClient,
    close,
  ])

  const allEntries = useMemo(() => {
    return [...searchResults, ...staticEntries]
  }, [searchResults, staticEntries])

  const filtered = useMemo(() => {
    if (!query) return staticEntries
    const q = query.toLowerCase()
    const matched = staticEntries.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.group.toLowerCase().includes(q),
    )
    return [...searchResults, ...matched]
  }, [staticEntries, searchResults, query])

  const groups = useMemo(() => {
    const map = new Map<string, CommandEntry[]>()
    for (const entry of filtered) {
      const group = map.get(entry.group) ?? []
      group.push(entry)
      map.set(entry.group, group)
    }
    return Array.from(map.entries())
  }, [filtered])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && filtered[activeIndex]) {
      e.preventDefault()
      filtered[activeIndex]!.onSelect()
    }
  }

  let flatIndex = -1

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <div className="flex flex-col">
          <div className="border-b px-3 py-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command or search emails..."
              className="border-0 shadow-none focus-visible:ring-0"
            />
          </div>

          <ScrollArea className="max-h-80">
            {searching && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                Searching emails...
              </div>
            )}
            {filtered.length === 0 && !searching ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No results found
              </div>
            ) : (
              <div className="p-1">
                {groups.map(([groupName, items]) => (
                  <div key={groupName}>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {groupName}
                    </div>
                    {items.map((entry) => {
                      flatIndex++
                      const idx = flatIndex
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={entry.onSelect}
                          onMouseEnter={() => setActiveIndex(idx)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                            idx === activeIndex
                              ? "bg-muted text-foreground"
                              : "text-foreground/80 hover:bg-muted/60",
                          )}
                        >
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate">{entry.label}</span>
                            {entry.description && (
                              <span className="truncate text-xs text-muted-foreground">
                                {entry.description}
                              </span>
                            )}
                          </div>
                          {entry.shortcut && (
                            <kbd className="ml-2 shrink-0 rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {entry.shortcut}
                            </kbd>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="flex items-center justify-between border-t px-3 py-1.5 text-[10px] text-muted-foreground">
            <div className="flex gap-2">
              <span>
                <kbd className="rounded border px-1 font-mono">↑↓</kbd> navigate
              </span>
              <span>
                <kbd className="rounded border px-1 font-mono">↵</kbd> select
              </span>
              <span>
                <kbd className="rounded border px-1 font-mono">esc</kbd> close
              </span>
            </div>
            {activeConnection && (
              <span className="truncate">{activeConnection.email}</span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
