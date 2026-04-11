import { randomUUID } from "crypto"
import type { CreateEventInput, CalendarEvent, CalendarEventAttendee } from "./types"
import type { DAVObject } from "tsdav"

export function buildVCalendar(input: CreateEventInput, uid?: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZeitMail//Calendar//EN",
    "BEGIN:VEVENT",
    `UID:${uid ?? randomUUID()}`,
    `SUMMARY:${escapeIcal(input.title)}`,
    `DTSTAMP:${formatIcalDate(new Date().toISOString(), false)}`,
  ]

  const isAllDay = input.allDay ?? false
  lines.push(`DTSTART${isAllDay ? ";VALUE=DATE" : ""}:${formatIcalDate(input.start, isAllDay)}`)
  lines.push(`DTEND${isAllDay ? ";VALUE=DATE" : ""}:${formatIcalDate(input.end, isAllDay)}`)

  if (input.description) {
    lines.push(`DESCRIPTION:${escapeIcal(input.description)}`)
  }
  if (input.location) {
    lines.push(`LOCATION:${escapeIcal(input.location)}`)
  }
  if (input.visibility && input.visibility !== "default") {
    lines.push(`CLASS:${input.visibility.toUpperCase()}`)
  }
  if (input.availability === "free") {
    lines.push("TRANSP:TRANSPARENT")
  } else {
    lines.push("TRANSP:OPAQUE")
  }

  if (input.recurrence?.length) {
    for (const rule of input.recurrence) {
      lines.push(rule.startsWith("RRULE:") ? rule : `RRULE:${rule}`)
    }
  }

  if (input.attendees?.length) {
    for (const attendee of input.attendees) {
      const params = ["PARTSTAT=NEEDS-ACTION"]
      if (attendee.role === "optional") params.push("ROLE=OPT-PARTICIPANT")
      else params.push("ROLE=REQ-PARTICIPANT")
      if (attendee.name) params.push(`CN=${escapeIcal(attendee.name)}`)
      lines.push(`ATTENDEE;${params.join(";")}:mailto:${attendee.email}`)
    }
  }

  lines.push("END:VEVENT")
  lines.push("END:VCALENDAR")

  return lines.join("\r\n")
}

export function parseVEvent(obj: DAVObject, calendarUrl: string): CalendarEvent | null {
  const data = obj.data
  if (!data || typeof data !== "string") return null

  const veventMatch = data.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/)
  if (!veventMatch) return null
  const vevent = veventMatch[0]

  const uid = extractField(vevent, "UID") ?? obj.url ?? ""
  const summary = extractField(vevent, "SUMMARY") ?? "(untitled)"
  const description = extractField(vevent, "DESCRIPTION") ?? undefined
  const location = extractField(vevent, "LOCATION") ?? undefined
  const dtstart = extractDateField(vevent, "DTSTART")
  const dtend = extractDateField(vevent, "DTEND")
  const status = extractField(vevent, "STATUS") ?? undefined
  const transp = extractField(vevent, "TRANSP")
  const classField = extractField(vevent, "CLASS")

  if (!dtstart) return null

  const isAllDay = dtstart.length <= 10

  const recurrence = extractAllFields(vevent, "RRULE")
  const recurringEventId = extractField(vevent, "RECURRENCE-ID") ?? undefined

  const attendees = parseAttendees(vevent)
  const organizer = parseOrganizer(vevent)

  return {
    id: uid,
    calendarId: calendarUrl,
    title: unescapeIcal(summary),
    description: description ? unescapeIcal(description) : undefined,
    location: location ? unescapeIcal(location) : undefined,
    allDay: isAllDay,
    start: dtstart,
    end: dtend ?? dtstart,
    status,
    recurrence: recurrence.length ? recurrence.map((r) => `RRULE:${r}`) : undefined,
    recurringEventId,
    attendees,
    organizer,
    visibility: mapClassToVisibility(classField),
    availability: transp === "TRANSPARENT" ? "free" : "busy",
    providerData: {
      url: obj.url ?? "",
      etag: obj.etag ?? "",
    },
  }
}

function parseAttendees(vevent: string): CalendarEventAttendee[] | undefined {
  const attendeeRegex = /^ATTENDEE[;:](.*)$/gm
  const attendees: CalendarEventAttendee[] = []

  let match
  while ((match = attendeeRegex.exec(vevent)) !== null) {
    const line = match[1]!
    const emailMatch = line.match(/mailto:([^\s;]+)/i)
    if (!emailMatch) continue

    const email = emailMatch[1]!
    const cnMatch = line.match(/CN=([^;:]+)/)
    const partstatMatch = line.match(/PARTSTAT=([^;:]+)/)
    const roleMatch = line.match(/ROLE=([^;:]+)/)

    attendees.push({
      email,
      name: cnMatch?.[1] ? unescapeIcal(cnMatch[1]) : undefined,
      status: mapPartStat(partstatMatch?.[1]),
      role: roleMatch?.[1] === "OPT-PARTICIPANT" ? "optional" : "required",
    })
  }

  return attendees.length ? attendees : undefined
}

function parseOrganizer(vevent: string): CalendarEvent["organizer"] {
  const orgMatch = vevent.match(/^ORGANIZER[;:](.*)$/m)
  if (!orgMatch) return undefined

  const line = orgMatch[1]!
  const emailMatch = line.match(/mailto:([^\s;]+)/i)
  if (!emailMatch) return undefined

  const cnMatch = line.match(/CN=([^;:]+)/)
  return {
    email: emailMatch[1]!,
    name: cnMatch?.[1] ? unescapeIcal(cnMatch[1]) : undefined,
  }
}

function mapPartStat(partstat?: string): string | undefined {
  switch (partstat?.toUpperCase()) {
    case "ACCEPTED": return "accepted"
    case "TENTATIVE": return "tentative"
    case "DECLINED": return "declined"
    case "NEEDS-ACTION": return "needsAction"
    default: return partstat
  }
}

function mapClassToVisibility(cls?: string | null): CalendarEvent["visibility"] {
  switch (cls?.toUpperCase()) {
    case "PUBLIC": return "public"
    case "PRIVATE": return "private"
    case "CONFIDENTIAL": return "confidential"
    default: return undefined
  }
}

function extractField(vevent: string, field: string): string | null {
  const regex = new RegExp(`^${field}(?:;[^:]*)?:(.*)$`, "m")
  const match = vevent.match(regex)
  return match?.[1]?.trim() ?? null
}

function extractAllFields(vevent: string, field: string): string[] {
  const regex = new RegExp(`^${field}(?:;[^:]*)?:(.*)$`, "gm")
  const results: string[] = []
  let match
  while ((match = regex.exec(vevent)) !== null) {
    if (match[1]) results.push(match[1].trim())
  }
  return results
}

function extractDateField(vevent: string, field: string): string | null {
  const raw = extractField(vevent, field)
  if (!raw) return null

  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
  }

  if (/^\d{8}T\d{6}Z?$/.test(raw)) {
    const y = raw.slice(0, 4)
    const mo = raw.slice(4, 6)
    const d = raw.slice(6, 8)
    const h = raw.slice(9, 11)
    const mi = raw.slice(11, 13)
    const s = raw.slice(13, 15)
    const z = raw.endsWith("Z") ? "Z" : ""
    return `${y}-${mo}-${d}T${h}:${mi}:${s}${z}`
  }

  return raw
}

export function formatIcalDate(isoDate: string, allDay: boolean): string {
  if (allDay) {
    return isoDate.replace(/-/g, "").slice(0, 8)
  }
  const d = new Date(isoDate)
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

function escapeIcal(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
}

function unescapeIcal(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
}
