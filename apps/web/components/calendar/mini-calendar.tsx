"use client"

import * as React from "react"
import { ArrowLeftIcon, ArrowRightIcon } from "@heroicons/react/16/solid"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "bruv-ui"
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
  displayMonth?: Date
  onDisplayMonthChange?: (month: Date) => void
}

export function MiniCalendar({
  className,
  selectedDate,
  onDateSelect,
  onDateDoubleClick,
  eventDates,
  displayMonth: displayMonthProp,
  onDisplayMonthChange,
}: MiniCalendarProps) {
  const [internalMonth, setInternalMonth] = React.useState(
    () => selectedDate ?? new Date()
  )

  const controlled =
    displayMonthProp !== undefined && onDisplayMonthChange !== undefined
  const viewMonth = controlled ? displayMonthProp! : internalMonth

  const setViewMonth = React.useCallback(
    (next: Date) => {
      if (controlled) onDisplayMonthChange!(next)
      else setInternalMonth(next)
    },
    [controlled, onDisplayMonthChange]
  )

  React.useEffect(() => {
    if (!controlled && selectedDate) setInternalMonth(selectedDate)
  }, [selectedDate, controlled])

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
      format(addDays(base, i), "EEEEE")
    )
  }, [])

  return (
    <div className={cn("w-full", className)}>
      <div className="relative flex h-8 items-center justify-center">
        <Button
          variant="transparent"
          size="xs"
          className="absolute left-0"
          aria-label="Previous month"
          iconLeft={<ArrowLeftIcon />}
          onClick={() => setViewMonth(subMonths(viewMonth, 1))}
        />
        <span className="text-sm font-medium">
          {format(viewMonth, "MMMM yyyy")}
        </span>
        <Button
          variant="transparent"
          size="xs"
          className="absolute right-0"
          aria-label="Next month"
          iconLeft={<ArrowRightIcon />}
          onClick={() => setViewMonth(addMonths(viewMonth, 1))}
        />
      </div>

      <div className="mt-2">
        <div className="grid grid-cols-7">
          {weekdayNames.map((name, i) => (
            <div
              key={i}
              className="flex size-8 items-center justify-center text-xs text-bruv-tertiary"
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
                selectedDate && format(selectedDate, "yyyy-MM-dd") === dateKey

              return (
                <div
                  key={dateKey}
                  className="flex size-8 items-center justify-center"
                >
                  <button
                    type="button"
                    onClick={() => onDateSelect?.(day)}
                    onDoubleClick={() => onDateDoubleClick?.(day)}
                    className={cn(
                      "relative flex size-7 items-center justify-center rounded-bruv-md text-xs transition-colors",
                      outside && "text-bruv-tertiary/40",
                      !outside && !today && !isSelected && "hover:bg-bruv-subtle",
                      today &&
                        !isSelected &&
                        "border border-bruv-accent bg-bruv-accent/10 font-medium text-bruv-accent",
                      isSelected && "bg-bruv-accent text-bruv-accent-on"
                    )}
                  >
                    {day.getDate()}
                    {hasEvents && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-bruv-accent" />
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
