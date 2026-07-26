"use client"

import * as React from "react"
import { Dialog, Button } from "bruv-ui"
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
  const title =
    action === "edit" ? "Edit recurring event" : "Delete recurring event"
  const description =
    action === "edit"
      ? "How would you like to edit this recurring event?"
      : "How would you like to delete this recurring event?"

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="flex w-[90vw] max-w-xs flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <Dialog.Title className="border-none p-0 text-base font-medium leading-none">
            {title}
          </Dialog.Title>
          <p className="text-sm text-bruv-tertiary">{description}</p>
        </div>
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
        <div className="flex justify-end">
          <Button variant="transparent" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
