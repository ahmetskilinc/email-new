"use client"

import * as React from "react"
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
  addDays,
} from "date-fns"
import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon } from "@hugeicons-pro/core-stroke-rounded"
import { MiniCalendar } from "@/components/calendar/mini-calendar"
import { MonthView } from "@/components/calendar/month-view"
import { EventDialog } from "@/components/calendar/event-dialog"
import { useCalendarEvents } from "@/hooks/use-calendar"
import type { CalendarEvent } from "@/server/lib/calendar/types"

export default function CalendarPage() {
  const [selectedDate, setSelectedDate] = React.useState(() => new Date())
  const [displayMonth, setDisplayMonth] = React.useState(() =>
    startOfMonth(new Date()),
  )
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingEvent, setEditingEvent] = React.useState<
    CalendarEvent | undefined
  >()
  const [createDate, setCreateDate] = React.useState<Date | undefined>()

  const rangeStart = React.useMemo(
    () => startOfWeek(startOfMonth(displayMonth), { weekStartsOn: 1 }),
    [displayMonth],
  )
  const rangeEnd = React.useMemo(
    () => endOfWeek(endOfMonth(displayMonth), { weekStartsOn: 1 }),
    [displayMonth],
  )

  const { data: monthEvents } = useCalendarEvents(rangeStart, rangeEnd)

  const eventDates = React.useMemo(() => {
    if (!monthEvents) return new Set<string>()
    const dates = new Set<string>()
    for (const event of monthEvents) {
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
  }, [monthEvents])

  const openCreate = (date?: Date) => {
    setEditingEvent(undefined)
    setCreateDate(date ?? selectedDate)
    setDialogOpen(true)
  }

  const openEdit = (event: CalendarEvent) => {
    setEditingEvent(event)
    setCreateDate(undefined)
    setDialogOpen(true)
  }

  const handleDateSelect = (date: Date) => {
    setSelectedDate(date)
    setDisplayMonth(startOfMonth(date))
  }

  const handleDateDoubleClick = (date: Date) => {
    handleDateSelect(date)
    openCreate(date)
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 gap-4 p-4">
      <div className="flex w-56 shrink-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">Calendar</span>
          <Button
            variant="outline"
            size="icon-xs"
            type="button"
            onClick={() => openCreate()}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
          </Button>
        </div>
        <MiniCalendar
          selectedDate={selectedDate}
          onDateSelect={handleDateSelect}
          onDateDoubleClick={handleDateDoubleClick}
          eventDates={eventDates}
          displayMonth={displayMonth}
          onDisplayMonthChange={setDisplayMonth}
        />
      </div>
      <MonthView
        className="min-w-0 flex-1"
        month={displayMonth}
        selectedDate={selectedDate}
        onSelectDate={(d) => {
          setSelectedDate(d)
        }}
        onCreateOnDay={(d) => openCreate(d)}
        onEditEvent={openEdit}
      />
      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={editingEvent}
        initialDate={createDate}
      />
    </div>
  )
}
