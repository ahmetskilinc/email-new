"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { atom, useAtom } from "jotai"

export const shortcutsHelpOpenAtom = atom(false)

const SHORTCUT_GROUPS: {
  group: string
  shortcuts: { keys: string[]; label: string }[]
}[] = [
  {
    group: "Navigation",
    shortcuts: [
      { keys: ["j"], label: "Focus next thread" },
      { keys: ["k"], label: "Focus previous thread" },
      { keys: ["↵", "o"], label: "Open focused thread" },
      { keys: ["esc"], label: "Close thread / clear selection" },
      { keys: ["/"], label: "Focus search" },
      { keys: ["⌘K"], label: "Command palette" },
    ],
  },
  {
    group: "Actions",
    shortcuts: [
      { keys: ["c"], label: "Compose" },
      { keys: ["r"], label: "Reply" },
      { keys: ["a"], label: "Reply all" },
      { keys: ["f"], label: "Forward" },
      { keys: ["e"], label: "Archive" },
      { keys: ["#"], label: "Delete" },
      { keys: ["s"], label: "Toggle star" },
      { keys: ["u"], label: "Mark as read" },
      { keys: ["⇧U"], label: "Mark as unread" },
    ],
  },
  {
    group: "Help",
    shortcuts: [{ keys: ["?"], label: "Show this overlay" }],
  },
]

export function ShortcutsHelp() {
  const [open, setOpen] = useAtom(shortcutsHelpOpenAtom)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {SHORTCUT_GROUPS.map(({ group, shortcuts }) => (
            <div key={group}>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                {group}
              </div>
              <div className="flex flex-col gap-1">
                {shortcuts.map(({ keys, label }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span>{label}</span>
                    <span className="flex gap-1">
                      {keys.map((key) => (
                        <kbd
                          key={key}
                          className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
