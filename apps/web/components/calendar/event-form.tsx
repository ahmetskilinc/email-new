"use client"

import * as React from "react"
import { format } from "date-fns"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Button } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { RecurrencePicker } from "./recurrence-picker"
import { useCalendars } from "@/hooks/use-calendar"
import type { CalendarEvent } from "@/server/lib/calendar/types"
import type { CreateEventData } from "@/server/lib/schemas"

interface EventFormProps {
  event?: CalendarEvent
  initialDate?: Date
  onSubmit: (data: CreateEventData) => void
  onCancel?: () => void
  onDelete?: () => void
  isSubmitting?: boolean
}

export function EventForm({
  event,
  initialDate,
  onSubmit,
  onCancel,
  onDelete,
  isSubmitting,
}: EventFormProps) {
  const { data: calendars } = useCalendars()

  const defaultDate = initialDate ?? new Date()
  const defaultStart = event?.start ?? format(defaultDate, "yyyy-MM-dd'T'HH:mm")
  const defaultEnd =
    event?.end ??
    format(
      new Date(defaultDate.getTime() + 60 * 60 * 1000),
      "yyyy-MM-dd'T'HH:mm"
    )

  const [title, setTitle] = React.useState(event?.title ?? "")
  const [description, setDescription] = React.useState(event?.description ?? "")
  const [location, setLocation] = React.useState(event?.location ?? "")
  const [allDay, setAllDay] = React.useState(event?.allDay ?? false)
  const [start, setStart] = React.useState(
    allDay ? defaultStart.split("T")[0]! : defaultStart
  )
  const [end, setEnd] = React.useState(
    allDay ? defaultEnd.split("T")[0]! : defaultEnd
  )
  const [calendarId, setCalendarId] = React.useState(event?.calendarId ?? "")
  const [recurrence, setRecurrence] = React.useState<string | null>(
    event?.recurrence?.[0] ?? null
  )
  const [visibility, setVisibility] = React.useState<string>(
    event?.visibility ?? "default"
  )
  const [availability, setAvailability] = React.useState<string>(
    event?.availability === "free" ? "free" : "busy"
  )

  React.useEffect(() => {
    if (!calendarId && calendars?.length) {
      const primary = calendars.find((c) => c.primary)
      setCalendarId(primary?.id ?? calendars[0]!.id)
    }
  }, [calendars, calendarId])

  const handleAllDayChange = (checked: boolean) => {
    setAllDay(checked)
    if (checked) {
      setStart(start.split("T")[0]!)
      setEnd(end.split("T")[0]!)
    } else {
      setStart(`${start.split("T")[0]}T09:00`)
      setEnd(`${end.split("T")[0]}T10:00`)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !calendarId) return

    const data: CreateEventData = {
      calendarId,
      title: title.trim(),
      start: allDay ? start : new Date(start).toISOString(),
      end: allDay ? end : new Date(end).toISOString(),
      allDay,
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      recurrence: recurrence ? [recurrence] : undefined,
      visibility: visibility as CreateEventData["visibility"],
      availability: availability as CreateEventData["availability"],
    }

    onSubmit(data)
  }

  const startDate = React.useMemo(() => {
    try {
      return new Date(start)
    } catch {
      return new Date()
    }
  }, [start])

  return (
    <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col">
      {/* Scrollable fields */}
      <div className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 pr-1">
          <div className="space-y-1.5">
            <Input
              placeholder="Event title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="all-day" className="text-xs text-muted-foreground">
              All day
            </Label>
            <Switch
              id="all-day"
              size="sm"
              checked={allDay}
              onCheckedChange={handleAllDayChange}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Start</Label>
              <Input
                type={allDay ? "date" : "datetime-local"}
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">End</Label>
              <Input
                type={allDay ? "date" : "datetime-local"}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Repeat</Label>
            <RecurrencePicker
              value={recurrence}
              onChange={setRecurrence}
              date={startDate}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Location
            </Label>
            <Input
              placeholder="Add location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Description
            </Label>
            <Textarea
              className=""
              placeholder="Add description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
            />
          </div>

          {calendars && calendars.length > 1 && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Calendar
              </Label>
              <Select
                value={calendarId}
                onValueChange={(v) => v && setCalendarId(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {calendars.find((c) => c.id === calendarId)?.name ??
                      "Select calendar"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {calendars
                    .filter((c) => !c.readOnly)
                    .map((cal) => (
                      <SelectItem key={cal.id} value={cal.id}>
                        {cal.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Status
              </Label>
              <Select
                value={availability}
                onValueChange={(v) => v && setAvailability(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {availability === "free" ? "Free" : "Busy"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="busy">Busy</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Visibility
              </Label>
              <Select
                value={visibility}
                onValueChange={(v) => v && setVisibility(v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {visibility === "default"
                      ? "Default"
                      : visibility.charAt(0).toUpperCase() +
                        visibility.slice(1)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Pinned actions */}
      <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-border pt-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          className="flex-1"
          disabled={isSubmitting || !title.trim()}
        >
          {isSubmitting ? "Saving..." : event ? "Update" : "Create"}
        </Button>
        {event && onDelete && (
          <Button type="button" variant="destructive" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
    </form>
  )
}
