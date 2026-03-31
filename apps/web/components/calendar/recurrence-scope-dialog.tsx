"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import type { RecurringEventScope } from "@/server/lib/calendar/types"

interface RecurrenceScopeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: "edit" | "delete"
  onSelect: (scope: RecurringEventScope) => void
}

export function RecurrenceScopeDialog({
  open,
  onOpenChange,
  action,
  onSelect,
}: RecurrenceScopeDialogProps) {
  const title = action === "edit" ? "Edit recurring event" : "Delete recurring event"
  const description =
    action === "edit"
      ? "How would you like to edit this recurring event?"
      : "How would you like to delete this recurring event?"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => {
              onSelect("single")
              onOpenChange(false)
            }}
          >
            This event only
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => {
              onSelect("thisAndFollowing")
              onOpenChange(false)
            }}
          >
            This and following events
          </Button>
          <Button
            variant="outline"
            className="justify-start"
            onClick={() => {
              onSelect("all")
              onOpenChange(false)
            }}
          >
            All events in the series
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
