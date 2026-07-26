"use client"

import * as React from "react"
import { Dialog } from "bruv-ui"
import { EventForm } from "./event-form"
import { EventView } from "./event-view"
import { RecurrenceScopeDialog } from "./recurrence-scope-dialog"
import {
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
} from "@/hooks/use-calendar"
import type { CalendarEvent } from "@/server/lib/calendar/types"
import type { RecurringEventScope } from "@/server/lib/calendar/types"
import type { CreateEventData } from "@/server/lib/schemas"
import { toast } from "bruv-ui"

interface EventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event?: CalendarEvent
  initialDate?: Date
}

export function EventDialog({
  open,
  onOpenChange,
  event,
  initialDate,
}: EventDialogProps) {
  const createEvent = useCreateEvent()
  const updateEvent = useUpdateEvent()
  const deleteEvent = useDeleteEvent()

  const [mode, setMode] = React.useState<"view" | "edit">("view")
  const [scopeAction, setScopeAction] = React.useState<{
    type: "edit" | "delete"
    data?: CreateEventData
  } | null>(null)

  const isRecurring = !!(event?.recurrence?.length || event?.recurringEventId)
  const isExistingEvent = !!event
  const isSubmitting = createEvent.isPending || updateEvent.isPending

  // Reset mode when dialog opens/closes or event changes
  React.useEffect(() => {
    if (open) {
      setMode(isExistingEvent ? "view" : "edit")
    }
  }, [open, isExistingEvent])

  const handleSubmit = (data: CreateEventData) => {
    if (isExistingEvent) {
      if (isRecurring) {
        setScopeAction({ type: "edit", data })
        return
      }
      updateEvent.mutate(
        {
          eventId: event.id,
          calendarId: data.calendarId,
          title: data.title,
          description: data.description,
          start: data.start,
          end: data.end,
          allDay: data.allDay,
          location: data.location,
          recurrence: data.recurrence,
          visibility: data.visibility,
          availability: data.availability,
        },
        {
          onSuccess: () => {
            toast.success("Event updated")
            onOpenChange(false)
          },
          onError: (err) =>
            toast.error(`Failed to update event: ${err.message}`),
        }
      )
    } else {
      createEvent.mutate(data, {
        onSuccess: () => {
          toast.success("Event created")
          onOpenChange(false)
        },
        onError: (err) => toast.error(`Failed to create event: ${err.message}`),
      })
    }
  }

  const handleDelete = () => {
    if (!event) return
    if (isRecurring) {
      setScopeAction({ type: "delete" })
      return
    }
    deleteEvent.mutate(
      { eventId: event.id, calendarId: event.calendarId },
      {
        onSuccess: () => {
          toast.success("Event deleted")
          onOpenChange(false)
        },
        onError: (err) => toast.error(`Failed to delete event: ${err.message}`),
      }
    )
  }

  const handleScopeSelect = (scope: RecurringEventScope) => {
    if (!event || !scopeAction) return

    if (scopeAction.type === "edit" && scopeAction.data) {
      updateEvent.mutate(
        {
          eventId: event.id,
          calendarId: scopeAction.data.calendarId,
          scope,
          title: scopeAction.data.title,
          description: scopeAction.data.description,
          start: scopeAction.data.start,
          end: scopeAction.data.end,
          allDay: scopeAction.data.allDay,
          location: scopeAction.data.location,
          recurrence: scopeAction.data.recurrence,
          visibility: scopeAction.data.visibility,
          availability: scopeAction.data.availability,
        },
        {
          onSuccess: () => {
            toast.success("Event updated")
            onOpenChange(false)
          },
          onError: (err) =>
            toast.error(`Failed to update event: ${err.message}`),
        }
      )
    } else if (scopeAction.type === "delete") {
      deleteEvent.mutate(
        { eventId: event.id, calendarId: event.calendarId, scope },
        {
          onSuccess: () => {
            toast.success("Event deleted")
            onOpenChange(false)
          },
          onError: (err) =>
            toast.error(`Failed to delete event: ${err.message}`),
        }
      )
    }

    setScopeAction(null)
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Content className="flex w-[90vw] max-w-lg flex-col gap-4 p-4">
          {mode === "view" && event ? (
            <>
              <Dialog.Title className="sr-only border-none p-0">
                Event details
              </Dialog.Title>
              <EventView
                event={event}
                onEdit={() => setMode("edit")}
                onDelete={handleDelete}
                isDeleting={deleteEvent.isPending}
              />
            </>
          ) : (
            <>
              <Dialog.Title className="border-none p-0 text-base font-medium leading-none">
                {isExistingEvent ? "Edit event" : "New event"}
              </Dialog.Title>
              <EventForm
                event={event}
                initialDate={initialDate}
                onSubmit={handleSubmit}
                onCancel={isExistingEvent ? () => setMode("view") : undefined}
                onDelete={isExistingEvent ? handleDelete : undefined}
                isSubmitting={isSubmitting}
              />
            </>
          )}
        </Dialog.Content>
      </Dialog.Root>

      <RecurrenceScopeDialog
        open={!!scopeAction}
        onOpenChange={(open) => !open && setScopeAction(null)}
        action={scopeAction?.type ?? "edit"}
        onSelect={handleScopeSelect}
      />
    </>
  )
}
