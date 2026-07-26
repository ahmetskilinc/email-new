"use client"

import { Button } from "bruv-ui"
import {
  ArchiveBoxIcon,
  TrashIcon,
  StarIcon,
  EnvelopeIcon,
  EnvelopeOpenIcon,
  XMarkIcon,
} from "@heroicons/react/16/solid"
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
} from "@/server/actions/mail"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "bruv-ui"

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
    messages: { loading: string; success: string; error: string }
  ) => {
    toast.promise(
      action(ids).then(() => {
        invalidate()
        clearAll()
      }),
      messages
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-b bg-bruv-subtle/30 px-3 py-1.5">
      <span className="text-xs font-medium">{count} selected</span>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="transparent"
          size="sm"
          aria-label="Archive selected"
          iconLeft={<ArchiveBoxIcon />}
          onClick={() =>
            handleAction(bulkArchive, {
              loading: "Archiving...",
              success: "Archived",
              error: "Failed to archive",
            })
          }
        />
        <Button
          variant="transparent"
          size="sm"
          aria-label="Delete selected"
          iconLeft={<TrashIcon />}
          onClick={() =>
            handleAction(bulkDelete, {
              loading: "Deleting...",
              success: "Deleted",
              error: "Failed to delete",
            })
          }
        />
        <Button
          variant="transparent"
          size="sm"
          aria-label="Star selected"
          iconLeft={<StarIcon />}
          onClick={() =>
            handleAction(bulkStar, {
              loading: "Starring...",
              success: "Starred",
              error: "Failed to star",
            })
          }
        />
        <Button
          variant="transparent"
          size="sm"
          aria-label="Mark as read"
          iconLeft={<EnvelopeOpenIcon />}
          onClick={() =>
            handleAction(markAsRead, {
              loading: "Updating...",
              success: "Marked as read",
              error: "Failed to mark as read",
            })
          }
        />
        <Button
          variant="transparent"
          size="sm"
          aria-label="Mark as unread"
          iconLeft={<EnvelopeIcon />}
          onClick={() =>
            handleAction(markAsUnread, {
              loading: "Updating...",
              success: "Marked as unread",
              error: "Failed to mark as unread",
            })
          }
        />
        <Button
          variant="transparent"
          size="sm"
          className="text-bruv-tertiary"
          aria-label="Deselect all"
          iconLeft={<XMarkIcon />}
          onClick={clearAll}
        />
      </div>
    </div>
  )
}
