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
import {
  bulkArchive,
  bulkDelete,
  bulkStar,
  markAsRead,
  markAsUnread,
} from "@/lib/api"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

export function BulkActionsToolbar() {
  const selectedIds = useSelectedThreadIds()
  const count = useSelectedCount()
  const { clearAll } = useSelectionActions()
  const queryClient = useQueryClient()

  if (count === 0) return null

  const ids = Array.from(selectedIds)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["threads"] })
    queryClient.invalidateQueries({ queryKey: ["allInboxes"] })
    queryClient.invalidateQueries({ queryKey: ["thread"] })
  }

  const handleAction = (
    action: (ids: string[]) => Promise<unknown>,
    messages: { loading: string; success: string; error: string },
  ) => {
    toast.promise(
      action(ids).then(() => {
        invalidate()
        clearAll()
      }),
      messages,
    )
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
          onClick={() =>
            handleAction(bulkArchive, {
              loading: "Archiving...",
              success: "Archived",
              error: "Failed to archive",
            })
          }
        >
          <HugeiconsIcon icon={ArchiveIcon} className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          aria-label="Delete selected"
          onClick={() =>
            handleAction(bulkDelete, {
              loading: "Deleting...",
              success: "Deleted",
              error: "Failed to delete",
            })
          }
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          aria-label="Star selected"
          onClick={() =>
            handleAction(bulkStar, {
              loading: "Starring...",
              success: "Starred",
              error: "Failed to star",
            })
          }
        >
          <HugeiconsIcon icon={FavouriteIcon} className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          aria-label="Mark as read"
          onClick={() =>
            handleAction(markAsRead, {
              loading: "Updating...",
              success: "Marked as read",
              error: "Failed to mark as read",
            })
          }
        >
          <HugeiconsIcon icon={MailOpen02Icon} className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          aria-label="Mark as unread"
          onClick={() =>
            handleAction(markAsUnread, {
              loading: "Updating...",
              success: "Marked as unread",
              error: "Failed to mark as unread",
            })
          }
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
