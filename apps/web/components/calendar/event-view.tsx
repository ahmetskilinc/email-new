"use client"

import * as React from "react"
import { format, isSameDay } from "date-fns"
import { cn } from "@workspace/ui/lib/utils"
import { Button, Badge } from "bruv-ui"
import {
  MapPinIcon,
  ClockIcon,
  ArrowPathRoundedSquareIcon,
  VideoCameraIcon,
  ArrowTopRightOnSquareIcon,
  UsersIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/16/solid"
import { detectConferenceLink } from "@/lib/meeting-links"
import { describeRRule } from "@/lib/recurrence"
import type { CalendarEvent } from "@/server/lib/calendar/types"

interface EventViewProps {
  event: CalendarEvent
  onEdit: () => void
  onDelete: () => void
  isDeleting?: boolean
}

export function EventView({
  event,
  onEdit,
  onDelete,
  isDeleting,
}: EventViewProps) {
  const conferenceLink = React.useMemo(
    () => detectConferenceLink(event),
    [event]
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
          className="mt-1.5 size-2.5 shrink-0 rounded-full bg-bruv-accent"
          style={event.color ? { backgroundColor: event.color } : undefined}
        />
        <h3 className="text-sm leading-snug font-medium">{event.title}</h3>
      </div>

      {/* Scrollable content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 pr-1">
          {/* Time */}
          <div className="flex items-start gap-2 text-xs text-bruv-tertiary">
            <ClockIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {timeDisplay}
              {event.allDay && (
                <span className="ml-1.5 text-[10px] text-bruv-tertiary/70 uppercase">
                  All day
                </span>
              )}
            </span>
          </div>

          {/* Recurrence */}
          {recurrenceLabel && (
            <div className="flex items-center gap-2 text-xs text-bruv-tertiary">
              <ArrowPathRoundedSquareIcon className="size-3.5 shrink-0" />
              <span>{recurrenceLabel}</span>
            </div>
          )}

          {/* Conference link */}
          {conferenceLink && (
            <a
              href={conferenceLink.joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-bruv-md border border-bruv-neutral bg-bruv-subtle/30 px-2.5 py-2 text-xs transition-colors hover:bg-bruv-subtle/60"
            >
              <VideoCameraIcon className="size-3.5 shrink-0 text-bruv-accent" />
              <span className="flex-1 font-medium">
                Join {conferenceLink.name}
              </span>
              <ArrowTopRightOnSquareIcon className="size-3 shrink-0 text-bruv-tertiary" />
            </a>
          )}

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-2 text-xs text-bruv-tertiary">
              <MapPinIcon className="mt-0.5 size-3.5 shrink-0" />
              <span className="break-words">{event.location}</span>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="rounded-bruv-md border border-bruv-neutral bg-bruv-subtle/20 p-2.5">
              <EventDescription text={event.description} />
            </div>
          )}

          {/* Attendees */}
          {event.attendees && event.attendees.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-bruv-tertiary">
                <UsersIcon className="size-3.5 shrink-0" />
                <span>
                  {event.attendees.length} attendee
                  {event.attendees.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {event.attendees.map((attendee) => (
                  <Badge
                    key={attendee.email}
                    variant="neutral"
                    className="text-[10px]"
                  >
                    {attendee.name || attendee.email}
                    {attendee.status && attendee.status !== "accepted" && (
                      <span className="ml-1 text-bruv-tertiary">
                        (
                        {attendee.status === "needsAction"
                          ? "pending"
                          : attendee.status}
                        )
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Organizer */}
          {event.organizer && !event.organizer.self && (
            <div className="text-xs text-bruv-tertiary">
              Organized by {event.organizer.name || event.organizer.email}
            </div>
          )}

          {/* Metadata row */}
          {(event.visibility && event.visibility !== "default") ||
          event.availability ? (
            <div className="flex items-center gap-2">
              {event.visibility && event.visibility !== "default" && (
                <div className="flex items-center gap-1 text-[10px] text-bruv-tertiary">
                  {event.visibility === "private" ? (
                    <EyeSlashIcon className="size-3" />
                  ) : (
                    <EyeIcon className="size-3" />
                  )}
                  <span className="capitalize">{event.visibility}</span>
                </div>
              )}
              {event.availability && (
                <div className="text-[10px] text-bruv-tertiary capitalize">
                  {event.availability}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer — pinned */}
      <div className="mt-3 flex shrink-0 items-center gap-2 border-t border-bruv-neutral pt-3">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          iconLeft={<PencilIcon />}
          onClick={onEdit}
        >
          Edit
        </Button>
        <Button
          variant="danger-light"
          size="sm"
          iconLeft={<TrashIcon />}
          onClick={onDelete}
          disabled={isDeleting}
        >
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
    (url) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
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
      ALLOWED_TAGS: [
        "a",
        "b",
        "strong",
        "i",
        "em",
        "br",
        "p",
        "ul",
        "ol",
        "li",
        "div",
        "span",
      ],
      ALLOWED_ATTR: ["href", "target", "rel"],
      ADD_ATTR: ["target"],
    })
  } else {
    // Input is plain text — escape, linkify, convert newlines
    const escaped = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [] })
    html = linkifyText(escaped).replace(/\n/g, "<br />")
  }

  // Link rewriting happens on the DOM, never by string surgery on serialized
  // HTML. The previous implementation spliced attributes in with
  // `html.replace(/<a /g, ...)` and rebuilt anchors via a template literal
  // *after* DOMPurify had run, reintroducing quote characters into attribute
  // values that sanitization had already settled. Anchors are built with
  // createElement/textContent here, so nothing user-supplied is ever parsed as
  // markup, and a final sanitize pass runs over the result regardless.
  const doc = new DOMParser().parseFromString(html, "text/html")
  linkifyTextNodes(doc.body)
  doc.body.querySelectorAll("a").forEach((anchor) => {
    anchor.setAttribute("target", "_blank")
    anchor.setAttribute("rel", "noopener noreferrer")
  })

  return DOMPurify.sanitize(doc.body.innerHTML, {
    ALLOWED_TAGS: [
      "a",
      "b",
      "strong",
      "i",
      "em",
      "br",
      "p",
      "ul",
      "ol",
      "li",
      "div",
      "span",
    ],
    ALLOWED_ATTR: ["href", "target", "rel"],
    ADD_ATTR: ["target"],
  })
}

const BARE_URL = /https?:\/\/[^\s<>"'{}|\\^`[\]]+/gi

/** Wraps bare URLs in text nodes with anchors, skipping existing links. */
function linkifyTextNodes(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const targets: Text[] = []

  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text
    if (text.parentElement?.closest("a")) continue
    if (text.data && BARE_URL.test(text.data)) targets.push(text)
    BARE_URL.lastIndex = 0
  }

  for (const node of targets) {
    const frag = node.ownerDocument.createDocumentFragment()
    let last = 0
    const data = node.data
    BARE_URL.lastIndex = 0

    for (let m = BARE_URL.exec(data); m; m = BARE_URL.exec(data)) {
      if (m.index > last) {
        frag.appendChild(
          node.ownerDocument.createTextNode(data.slice(last, m.index))
        )
      }
      const anchor = node.ownerDocument.createElement("a")
      anchor.setAttribute("href", m[0])
      anchor.setAttribute("target", "_blank")
      anchor.setAttribute("rel", "noopener noreferrer")
      anchor.textContent = m[0]
      frag.appendChild(anchor)
      last = m.index + m[0].length
    }

    if (last < data.length) {
      frag.appendChild(node.ownerDocument.createTextNode(data.slice(last)))
    }
    node.replaceWith(frag)
  }
}

function EventDescription({ text }: { text: string }) {
  const sanitizedHtml = React.useMemo(() => sanitizeDescription(text), [text])

  return (
    <div
      className="event-description text-xs leading-relaxed break-words text-bruv-tertiary [&_a]:break-all [&_a]:text-bruv-accent [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-bruv-accent/80 [&_br+br]:mb-1.5 [&_br+br]:block [&_br+br]:content-[''] [&_li]:mb-0.5 [&_ol]:mb-1.5 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mb-1.5 [&_p:last-child]:mb-0 [&_ul]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-4"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  )
}
