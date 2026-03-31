"use client"

import * as React from "react"
import { format, isSameDay } from "date-fns"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Location01Icon,
  Clock01Icon,
  RepeatIcon,
  Video01Icon,
  LinkSquare01Icon,
  UserMultiple02Icon,
  PencilEdit01Icon,
  Delete02Icon,
  ViewIcon,
  ViewOffIcon,
} from "@hugeicons-pro/core-stroke-rounded"
import { detectConferenceLink } from "@/lib/meeting-links"
import { describeRRule } from "@/lib/recurrence"
import type { CalendarEvent } from "@/server/lib/calendar/types"

interface EventViewProps {
  event: CalendarEvent
  onEdit: () => void
  onDelete: () => void
  isDeleting?: boolean
}

export function EventView({ event, onEdit, onDelete, isDeleting }: EventViewProps) {
  const conferenceLink = React.useMemo(
    () => detectConferenceLink(event),
    [event],
  )

  const timeDisplay = React.useMemo(() => {
    if (event.allDay) {
      const start = new Date(event.start)
      const end = new Date(event.end)
      if (isSameDay(start, end) || event.end === event.start) {
        return format(start, "EEEE, MMMM d, yyyy")
      }
      return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`
    }
    const start = new Date(event.start)
    const end = new Date(event.end)
    if (isSameDay(start, end)) {
      return `${format(start, "EEEE, MMMM d, yyyy")} · ${format(start, "h:mm a")} – ${format(end, "h:mm a")}`
    }
    return `${format(start, "MMM d, h:mm a")} – ${format(end, "MMM d, h:mm a, yyyy")}`
  }, [event])

  const recurrenceLabel = React.useMemo(() => {
    if (!event.recurrence?.length) return null
    return describeRRule(event.recurrence[0]!)
  }, [event.recurrence])

  return (
    <div className="flex max-h-[70vh] flex-col">
      {/* Header — pinned */}
      <div className="flex shrink-0 items-start gap-2 pb-3">
        <div
          className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary"
          style={event.color ? { backgroundColor: event.color } : undefined}
        />
        <h3 className="text-sm font-medium leading-snug">{event.title}</h3>
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 pr-1">
          {/* Time */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <HugeiconsIcon icon={Clock01Icon} className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {timeDisplay}
              {event.allDay && (
                <span className="ml-1.5 text-[10px] uppercase text-muted-foreground/70">
                  All day
                </span>
              )}
            </span>
          </div>

          {/* Recurrence */}
          {recurrenceLabel && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <HugeiconsIcon icon={RepeatIcon} className="size-3.5 shrink-0" />
              <span>{recurrenceLabel}</span>
            </div>
          )}

          {/* Conference link */}
          {conferenceLink && (
            <a
              href={conferenceLink.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs transition-colors hover:bg-muted/60"
            >
              <HugeiconsIcon icon={Video01Icon} className="size-3.5 shrink-0 text-primary" />
              <span className="flex-1 font-medium">Join {conferenceLink.name}</span>
              <HugeiconsIcon icon={LinkSquare01Icon} className="size-3 shrink-0 text-muted-foreground" />
            </a>
          )}

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <HugeiconsIcon icon={Location01Icon} className="mt-0.5 size-3.5 shrink-0" />
              <span className="break-words">{event.location}</span>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="rounded-md border border-border bg-muted/20 p-2.5">
              <EventDescription text={event.description} />
            </div>
          )}

          {/* Attendees */}
          {event.attendees && event.attendees.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <HugeiconsIcon icon={UserMultiple02Icon} className="size-3.5 shrink-0" />
                <span>
                  {event.attendees.length} attendee{event.attendees.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {event.attendees.map((attendee) => (
                  <Badge key={attendee.email} variant="secondary" className="text-[10px]">
                    {attendee.name || attendee.email}
                    {attendee.status && attendee.status !== "accepted" && (
                      <span className="ml-1 text-muted-foreground">
                        ({attendee.status === "needsAction" ? "pending" : attendee.status})
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Organizer */}
          {event.organizer && !event.organizer.self && (
            <div className="text-xs text-muted-foreground">
              Organized by {event.organizer.name || event.organizer.email}
            </div>
          )}

          {/* Metadata row */}
          {(event.visibility && event.visibility !== "default") || event.availability ? (
            <div className="flex items-center gap-2">
              {event.visibility && event.visibility !== "default" && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  {event.visibility === "private" ? (
                    <HugeiconsIcon icon={ViewOffIcon} className="size-3" />
                  ) : (
                    <HugeiconsIcon icon={ViewIcon} className="size-3" />
                  )}
                  <span className="capitalize">{event.visibility}</span>
                </div>
              )}
              {event.availability && (
                <div className="text-[10px] text-muted-foreground capitalize">
                  {event.availability}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer — pinned */}
      <div className="flex shrink-0 items-center gap-2 border-t border-border pt-3 mt-3">
        <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
          <HugeiconsIcon icon={PencilEdit01Icon} className="size-3" data-icon="inline-start" />
          Edit
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={isDeleting}
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-3" data-icon="inline-start" />
          {isDeleting ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </div>
  )
}

const BARE_URL_REGEX = /(?<![="'])https?:\/\/[^\s<>"'{}|\\^`[\]]+/g

function isHtml(text: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(text)
}

function linkifyText(text: string): string {
  return text.replace(
    BARE_URL_REGEX,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`,
  )
}

function htmlToPlainText(html: string): string {
  let text = html
  text = text.replace(/<br\s*\/?>/gi, "\n")
  text = text.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
  text = text.replace(/<\/div>\s*<div[^>]*>/gi, "\n")
  text = text.replace(/<\/li>/gi, "\n")
  text = text.replace(/<li[^>]*>/gi, "• ")
  text = text.replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
  text = text.replace(/<\/?(h[1-6])[^>]*>/gi, "\n")
  text = text.replace(/<[^>]+>/g, "")
  text = text.replace(/&nbsp;/gi, " ")
  text = text.replace(/&amp;/gi, "&")
  text = text.replace(/&lt;/gi, "<")
  text = text.replace(/&gt;/gi, ">")
  text = text.replace(/&quot;/gi, '"')
  text = text.replace(/&#39;/gi, "'")
  text = text.replace(/\n{3,}/g, "\n\n")
  return text.trim()
}

function sanitizeDescription(raw: string): string {
  if (typeof window === "undefined") {
    // SSR: strip all tags, keep text
    const plain = isHtml(raw) ? htmlToPlainText(raw) : raw
    const escaped = plain
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
    return linkifyText(escaped).replace(/\n/g, "<br />")
  }

  const DOMPurify = require("dompurify") as typeof import("dompurify").default

  let html: string
  if (isHtml(raw)) {
    // Input is HTML — sanitize it, keeping safe tags
    html = DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ["a", "b", "strong", "i", "em", "br", "p", "ul", "ol", "li", "div", "span"],
      ALLOWED_ATTR: ["href", "target", "rel"],
      ADD_ATTR: ["target"],
    })
    // Ensure all links open in new tab
    html = html.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')
  } else {
    // Input is plain text — escape, linkify, convert newlines
    const escaped = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [] })
    html = linkifyText(escaped).replace(/\n/g, "<br />")
  }

  // Auto-link any bare URLs that aren't already inside <a> tags
  html = html.replace(
    /(<a\b[^>]*>[\s\S]*?<\/a>)|(?<![="'])https?:\/\/[^\s<>"'{}|\\^`[\]]+/gi,
    (match, existingLink) => {
      if (existingLink) return existingLink
      return `<a href="${match}" target="_blank" rel="noopener noreferrer">${match}</a>`
    },
  )

  return html
}

function EventDescription({ text }: { text: string }) {
  const sanitizedHtml = React.useMemo(() => sanitizeDescription(text), [text])

  return (
    <div
      className="event-description text-xs leading-relaxed text-muted-foreground break-words [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-primary/80 [&_a]:break-all [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-1.5 [&_li]:mb-0.5 [&_br+br]:block [&_br+br]:content-[''] [&_br+br]:mb-1.5"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
}
