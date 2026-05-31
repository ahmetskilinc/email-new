"use client"

import * as React from "react"
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addDays,
  format,
  isSameMonth,
  isToday,
  startOfDay,
  endOfDay,
  isSameDay,
} from "date-fns"
import { cn } from "@workspace/ui/lib/utils"
import { useCalendarEvents } from "@/hooks/use-calendar"
import type { CalendarEvent } from "@/server/lib/calendar/types"

const MAX_CHIPS = 3

function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = startOfDay(day)
  const dayEnd = endOfDay(day)
  return events
    .filter((ev) => {
      const evStart = new Date(ev.start)
      const evEnd = new Date(ev.end)
      return evStart <= dayEnd && evEnd >= dayStart
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
}

export function MonthView({
  month,
  selectedDate,
  onSelectDate,
  onCreateOnDay,
  onEditEvent,
  className,
}: {
  month: Date
  selectedDate: Date
  onSelectDate: (d: Date) => void
  onCreateOnDay: (d: Date) => void
  onEditEvent: (e: CalendarEvent) => void
  className?: string
}) {
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const { data: events = [], isLoading } = useCalendarEvents(gridStart, gridEnd)

  const weekdayNames = React.useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => format(addDays(base, i), "EEE"))
  }, [])

  const weeks = React.useMemo(() => {
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd })
    const rows: Date[][] = []
    for (let i = 0; i < days.length; i += 7) {
      rows.push(days.slice(i, i + 7))
    }
    return rows
  }, [gridStart, gridEnd])

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border",
        className
      )}
    >
      <div className="grid shrink-0 grid-cols-7 border-b bg-muted/30 text-center text-xs font-medium text-muted-foreground">
        {weekdayNames.map((name, i) => (
          <div key={i} className="border-r py-2 last:border-r-0">
            {name}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 auto-rows-fr">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center p-8 text-sm text-muted-foreground">
            Loading events…
          </div>
        ) : (
          weeks.map((week, wi) => (
            <div
              key={wi}
              className="grid min-h-[104px] grid-cols-7 border-b last:border-b-0"
            >
              {week.map((day) => {
                const dayEvents = eventsForDay(events, day)
                const outside = !isSameMonth(day, month)
                const today = isToday(day)
                const isSelected = isSameDay(day, selectedDate)
                const visible = dayEvents.slice(0, MAX_CHIPS)
                const overflow = dayEvents.length - visible.length

                return (
                  <div
                    key={format(day, "yyyy-MM-dd")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        onSelectDate(day)
                        onCreateOnDay(day)
                      }
                    }}
                    className={cn(
                      "flex min-h-[104px] min-w-0 flex-col border-r p-1 outline-none last:border-r-0 focus-visible:ring-2 focus-visible:ring-ring",
                      outside && "bg-muted/30"
                    )}
                    onClick={() => {
                      onSelectDate(day)
                      onCreateOnDay(day)
                    }}
                  >
                    <div className="mb-0.5 flex justify-end px-0.5">
                      <span
                        className={cn(
                          "flex size-7 items-center justify-center rounded-md text-xs font-medium",
                          today &&
                            !isSelected &&
                            "border border-primary bg-primary/10 text-primary",
                          isSelected && "bg-primary text-primary-foreground",
                          !today &&
                            !isSelected &&
                            (outside
                              ? "text-muted-foreground/60"
                              : "text-foreground")
                        )}
                      >
                        {day.getDate()}
                      </span>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col gap-0.5">
                      {visible.map((ev) => (
                        <button
                          key={`${ev.id}-${ev.start}`}
                          type="button"
                          className={cn(
                            "truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight transition-colors",
                            "bg-primary/15 hover:bg-primary/25"
                          )}
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectDate(day)
                            onEditEvent(ev)
                          }}
                        >
                          <span className="font-medium text-foreground">
                            {!ev.allDay
                              ? `${format(new Date(ev.start), "HH:mm")} `
                              : ""}
                            {ev.title || "(no title)"}
                          </span>
                        </button>
                      ))}
                      {overflow > 0 ? (
                        <span className="px-1 text-[10px] text-muted-foreground">
                          +{overflow} more
                        </span>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
