"use client"

import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArchiveIcon,
  Delete02Icon,
  FavouriteIcon,
  Mail01Icon,
  MailOpen02Icon,
  Cancel01Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import {
  useSelectedThreadIds,
  useSelectedCount,
  useSelectionActions,
} from "@/store/selection"
import { useThreadActions } from "@/hooks/use-thread-actions"

export function BulkActionsToolbar() {
  const selectedIds = useSelectedThreadIds()
  const count = useSelectedCount()
  const { clearAll } = useSelectionActions()
  const { archive, deleteThreads, toggleStar, markRead, markUnread } =
    useThreadActions()

  if (count === 0) return null

  const ids = Array.from(selectedIds)

  const run = (action: (ids: string[]) => void) => {
    action(ids)
    clearAll()
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-3 py-1.5">
      <span className="text-xs font-medium">{count} selected</span>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          aria-label="Archive selected"
          onClick={() => run(archive)}
        >
          <HugeiconsIcon icon={ArchiveIcon} className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          aria-label="Delete selected"
          onClick={() => run(deleteThreads)}
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          aria-label="Star selected"
          onClick={() => run((ids) => toggleStar(ids, true))}
        >
          <HugeiconsIcon icon={FavouriteIcon} className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          aria-label="Mark as read"
          onClick={() => run(markRead)}
        >
          <HugeiconsIcon icon={MailOpen02Icon} className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          aria-label="Mark as unread"
          onClick={() => run(markUnread)}
        >
          <HugeiconsIcon icon={Mail01Icon} className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground"
          aria-label="Deselect all"
          onClick={clearAll}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
