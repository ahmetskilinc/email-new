"use client"

import * as React from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarSeparator,
} from "@workspace/ui/components/sidebar"
import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { Calendar03Icon } from "@hugeicons-pro/core-stroke-rounded"
import { Add01Icon } from "@hugeicons-pro/core-stroke-rounded"
import { MiniCalendar } from "./calendar/mini-calendar"
import { EventList } from "./calendar/event-list"
import { EventDialog } from "./calendar/event-dialog"
import { useCalendarEvents } from "@/hooks/use-calendar"
import { addDays, startOfDay, format } from "date-fns"
import type { CalendarEvent } from "@/server/lib/calendar/types"

function useStableToday() {
  const [today, setToday] = React.useState<Date | null>(null)
  React.useEffect(() => setToday(new Date()), [])
  return today
}

export function AppSidebarRight() {
  const today = useStableToday()
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingEvent, setEditingEvent] = React.useState<
    CalendarEvent | undefined
  >()
  const [createDate, setCreateDate] = React.useState<Date | undefined>()

  const activeDate = selectedDate ?? today

  const timeMin = React.useMemo(
    () => (activeDate ? startOfDay(activeDate) : null),
    [activeDate]
  )
  const timeMax = React.useMemo(
    () => (timeMin ? addDays(timeMin, 14) : null),
    [timeMin]
  )

  const { data: events, isLoading } = useCalendarEvents(timeMin, timeMax)

  const eventDates = React.useMemo(() => {
    if (!events) return new Set<string>()
    const dates = new Set<string>()
    for (const event of events) {
      const start = new Date(event.start)
      dates.add(format(start, "yyyy-MM-dd"))
      if (event.allDay) {
        const end = new Date(event.end)
        let current = start
        while (current < end) {
          dates.add(format(current, "yyyy-MM-dd"))
          current = addDays(current, 1)
        }
      }
    }
    return dates
  }, [events])

  const openCreateDialog = (date?: Date) => {
    setEditingEvent(undefined)
    setCreateDate(date ?? activeDate ?? undefined)
    setDialogOpen(true)
  }

  const openEditDialog = (event: CalendarEvent) => {
    setEditingEvent(event)
    setCreateDate(undefined)
    setDialogOpen(true)
  }

  const handleDateDoubleClick = (date: Date) => {
    openCreateDialog(date)
  }

  return (
    <Sidebar variant="inset" collapsible="offcanvas" side="right">
      <SidebarHeader className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Calendar03Icon} className="size-4" />
            <span className="block text-sm font-semibold group-data-[state=collapsed]:hidden">
              Calendar
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            className="group-data-[state=collapsed]:hidden"
            onClick={() => openCreateDialog()}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
          </Button>
        </div>
      </SidebarHeader>
      {activeDate ? (
        <>
          <div className="shrink-0 px-1.5 group-data-[state=collapsed]:hidden">
            <MiniCalendar
              selectedDate={activeDate}
              onDateSelect={setSelectedDate}
              onDateDoubleClick={handleDateDoubleClick}
              eventDates={eventDates}
            />
          </div>
          <SidebarSeparator className="mt-3 group-data-[state=collapsed]:hidden" />
          <SidebarContent className="group-data-[state=collapsed]:hidden">
            <EventList
              events={events ?? []}
              selectedDate={activeDate}
              isLoading={isLoading}
              onEventClick={openEditDialog}
            />
          </SidebarContent>
        </>
      ) : null}

      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={editingEvent}
        initialDate={createDate}
      />
    </Sidebar>
  )
}
