"use client"

import * as React from "react"
import {
  format,
  isToday,
  isTomorrow,
  isSameDay,
  startOfDay,
  addDays,
} from "date-fns"
import { cn } from "@workspace/ui/lib/utils"
import type { CalendarEvent } from "@/server/lib/calendar/types"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

interface EventListProps {
  events: CalendarEvent[]
  selectedDate?: Date
  isLoading?: boolean
  className?: string
  onEventClick?: (event: CalendarEvent) => void
}

export function EventList({
  events,
  selectedDate,
  isLoading,
  className,
  onEventClick,
}: EventListProps) {
  const groupedDays = React.useMemo(() => {
    const baseDate = selectedDate ?? new Date()
    const days: { date: Date; events: CalendarEvent[] }[] = []

    for (let i = 0; i < 14; i++) {
      const day = addDays(startOfDay(baseDate), i)
      const dayEvents = events.filter((e) => {
        const eventStart = new Date(e.start)
        if (e.allDay) {
          const eventEnd = new Date(e.end)
          return eventStart <= day && eventEnd > day
        }
        return isSameDay(eventStart, day)
      })
      if (dayEvents.length > 0) {
        days.push({ date: day, events: dayEvents })
      }
    }

    return days
  }, [events, selectedDate])

  if (isLoading) {
    return (
      <div className={cn("space-y-3 p-1", className)}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-12 animate-pulse rounded-md bg-muted" />
          </div>
        ))}
      </div>
    )
  }

  if (groupedDays.length === 0) {
    return (
      <div className={cn("flex flex-col items-center py-8 text-center", className)}>
        <p className="text-xs text-muted-foreground">No upcoming events</p>
      </div>
    )
  }

  return (
    <ScrollArea className={cn("", className)}>
      <div className="space-y-1 p-1">
        {groupedDays.map(({ date, events: dayEvents }) => (
          <DayGroup key={date.toISOString()} date={date} events={dayEvents} onEventClick={onEventClick} />
        ))}
      </div>
    </ScrollArea>
  )
}

function DayGroup({ date, events, onEventClick }: { date: Date; events: CalendarEvent[]; onEventClick?: (event: CalendarEvent) => void }) {
  const label = getDayLabel(date)

  return (
    <div>
      <div className="sticky top-0 z-10 bg-sidebar px-1 py-1.5">
        <span
          className={cn(
            "text-xs font-medium text-muted-foreground",
            isToday(date) && "text-primary font-semibold",
          )}
        >
          {label}
        </span>
      </div>
      <div className="space-y-1">
        {events.map((event) => (
          <EventItem key={event.id} event={event} onClick={onEventClick} />
        ))}
      </div>
    </div>
  )
}

function EventItem({ event, onClick }: { event: CalendarEvent; onClick?: (event: CalendarEvent) => void }) {
  const time = React.useMemo(() => {
    if (event.allDay) return "All day"
    try {
      return format(new Date(event.start), "h:mm a")
    } catch {
      return ""
    }
  }, [event.start, event.allDay])

  return (
    <div
      className="group flex cursor-pointer gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/50"
      onClick={() => onClick?.(event)}
    >
      <div
        className="mt-1 h-full w-0.5 shrink-0 rounded-full bg-primary"
        style={event.color ? { backgroundColor: event.color } : undefined}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{event.title}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground uppercase">
            {time}
          </span>
          {event.location && (
            <>
              <span className="text-[10px] text-muted-foreground/50">·</span>
              <span className="truncate text-[10px] text-muted-foreground">
                {event.location}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function getDayLabel(date: Date): string {
  if (isToday(date)) return `Today — ${format(date, "MMM d")}`
  if (isTomorrow(date)) return `Tomorrow — ${format(date, "MMM d")}`
  return format(date, "EEE, MMM d")
}
