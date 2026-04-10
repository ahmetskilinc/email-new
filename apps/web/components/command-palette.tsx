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
import {
  navigationConfig,
  navigationConfigTopNav,
} from "@/config/navigation"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"

interface CommandEntry {
  id: string
  label: string
  group: string
  shortcut?: string
  onSelect: () => void
}

export function CommandPalette() {
  const [open, setOpen] = useCommandPalette()
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const router = useRouter()
  const openCompose = useOpenCompose()
  const inputRef = useRef<HTMLInputElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery("")
    setActiveIndex(0)
  }, [setOpen])

  const entries = useMemo<CommandEntry[]>(() => {
    const nav: CommandEntry[] = [
      ...navigationConfig,
      ...navigationConfigTopNav,
    ].map((item) => ({
      id: `nav-${item.id}`,
      label: item.title,
      group: "Navigation",
      onSelect: () => {
        router.push(item.href)
        close()
      },
    }))

    const actions: CommandEntry[] = [
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
            const input = document.querySelector<HTMLInputElement>(
              '[data-slot="search-input"]',
            )
            input?.focus()
          }, 100)
        },
      },
    ]

    const settings: CommandEntry[] = [
      {
        id: "settings-general",
        label: "Settings: General",
        group: "Settings",
        onSelect: () => {
          close()
        },
      },
      {
        id: "settings-signatures",
        label: "Settings: Signatures",
        group: "Settings",
        onSelect: () => {
          close()
        },
      },
      {
        id: "settings-notifications",
        label: "Settings: Notifications",
        group: "Settings",
        onSelect: () => {
          close()
        },
      },
    ]

    return [...nav, ...actions, ...settings]
  }, [router, openCompose, close])

  const filtered = useMemo(() => {
    if (!query) return entries
    const q = query.toLowerCase()
    return entries.filter(
      (e) =>
        e.label.toLowerCase().includes(q) ||
        e.group.toLowerCase().includes(q),
    )
  }, [entries, query])

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
              placeholder="Type a command or search..."
              className="border-0 shadow-none focus-visible:ring-0"
            />
          </div>

          <ScrollArea className="max-h-72">
            {filtered.length === 0 ? (
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
                          <span>{entry.label}</span>
                          {entry.shortcut && (
                            <kbd className="rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
