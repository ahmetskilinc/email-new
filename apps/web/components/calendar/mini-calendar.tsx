"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons-pro/core-stroke-rounded"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import {
  startOfMonth,
  startOfWeek,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  eachDayOfInterval,
  addDays,
} from "date-fns"

interface MiniCalendarProps {
  className?: string
  selectedDate?: Date
  onDateSelect?: (date: Date) => void
  onDateDoubleClick?: (date: Date) => void
  eventDates?: Set<string>
}

export function MiniCalendar({
  className,
  selectedDate,
  onDateSelect,
  onDateDoubleClick,
  eventDates,
}: MiniCalendarProps) {
  const [viewMonth, setViewMonth] = React.useState(
    () => selectedDate ?? new Date(),
  )

  React.useEffect(() => {
    if (selectedDate) setViewMonth(selectedDate)
  }, [selectedDate])

  const weeks = React.useMemo(() => {
    const monthStart = startOfMonth(viewMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const days = eachDayOfInterval({
      start: gridStart,
      end: addDays(gridStart, 41),
    })
    const result: Date[][] = []
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7))
    }
    return result
  }, [viewMonth])

  const weekdayNames = React.useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) =>
      format(addDays(base, i), "EEEEE"),
    )
  }, [])

  return (
    <div className={cn("w-full", className)}>
      <div className="relative flex h-8 items-center justify-center">
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute left-0"
          onClick={() => setViewMonth((prev) => subMonths(prev, 1))}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
        </Button>
        <span className="text-sm font-medium">
          {format(viewMonth, "MMMM yyyy")}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute right-0"
          onClick={() => setViewMonth((prev) => addMonths(prev, 1))}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
        </Button>
      </div>

      <div className="mt-2">
        <div className="grid grid-cols-7">
          {weekdayNames.map((name, i) => (
            <div
              key={i}
              className="flex size-8 items-center justify-center text-xs text-muted-foreground"
            >
              {name}
            </div>
          ))}
        </div>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7">
            {week.map((day) => {
              const today = isToday(day)
              const outside = !isSameMonth(day, viewMonth)
              const dateKey = format(day, "yyyy-MM-dd")
              const hasEvents = eventDates?.has(dateKey)
              const isSelected =
                selectedDate &&
                format(selectedDate, "yyyy-MM-dd") === dateKey

              return (
                <div key={dateKey} className="flex size-8 items-center justify-center">
                  <button
                    type="button"
                    onClick={() => onDateSelect?.(day)}
                    onDoubleClick={() => onDateDoubleClick?.(day)}
                    className={cn(
                      "relative flex size-7 items-center justify-center rounded-md text-xs transition-colors",
                      outside && "text-muted-foreground/40",
                      !outside && !today && !isSelected && "hover:bg-muted",
                      today &&
                        !isSelected &&
                        "border border-primary bg-primary/10 font-medium text-primary",
                      isSelected &&
                        "bg-primary text-primary-foreground",
                    )}
                  >
                    {day.getDate()}
                    {hasEvents && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary" />
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
