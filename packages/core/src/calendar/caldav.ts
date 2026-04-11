import { createDAVClient, type DAVCalendar, type DAVObject } from "tsdav"
import { randomUUID } from "crypto"
import type {
  CalendarProvider,
  CalendarProviderConfig,
  CalendarInfo,
  CalendarEvent,
  ListEventsOptions,
  CreateEventInput,
  UpdateEventInput,
  DeleteEventInput,
} from "./types"
import { buildVCalendar, parseVEvent } from "./ical-utils"

interface CalDAVProviderOptions {
  serverUrl: string
  authMethod: "Basic" | "Oauth"
}

const CALDAV_CONFIGS: Record<string, CalDAVProviderOptions> = {
  icloud: {
    serverUrl: "https://caldav.icloud.com",
    authMethod: "Basic",
  },
  yahoo: {
    serverUrl: "https://caldav.calendar.yahoo.com",
    authMethod: "Basic",
  },
}

export class CalDAVCalendarProvider implements CalendarProvider {
  private providerOptions: CalDAVProviderOptions

  constructor(
    private config: CalendarProviderConfig,
    private providerId: "icloud" | "yahoo",
  ) {
    this.providerOptions = CALDAV_CONFIGS[providerId]!
  }

  private async createClient() {
    return createDAVClient({
      serverUrl: this.providerOptions.serverUrl,
      credentials: {
        username: this.config.email,
        password: this.config.accessToken,
      },
      authMethod: this.providerOptions.authMethod,
      defaultAccountType: "caldav",
    })
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    try {
      const client = await this.createClient()
      const calendars = await client.fetchCalendars()

      return calendars
        .filter((c: DAVCalendar) => c.components?.includes("VEVENT"))
        .map((c: DAVCalendar) => ({
          id: c.url,
          name: typeof c.displayName === "string" ? c.displayName : "Calendar",
          color: (c as any).calendarColor ?? undefined,
          primary: false,
          readOnly: false,
        }))
    } catch (err) {
      console.error(`[CalDAV:${this.providerId}] Failed to list calendars:`, err)
      return []
    }
  }

  async listEvents(options: ListEventsOptions): Promise<CalendarEvent[]> {
    try {
      const client = await this.createClient()
      const calendars = await client.fetchCalendars()

      const targetCalendars = options.calendarId
        ? calendars.filter((c: DAVCalendar) => c.url === options.calendarId)
        : calendars.filter((c: DAVCalendar) => c.components?.includes("VEVENT"))

      const allEvents: CalendarEvent[] = []

      await Promise.all(
        targetCalendars.map(async (cal: DAVCalendar) => {
          try {
            const objects = await client.fetchCalendarObjects({
              calendar: cal,
              timeRange: {
                start: options.timeMin.toISOString(),
                end: options.timeMax.toISOString(),
              },
              expand: true,
            })

            console.log(
              `[CalDAV:${this.providerId}] ${cal.displayName}: ${objects.length} objects returned`,
            )

            for (const obj of objects) {
              const parsed = parseVEvent(obj, cal.url)
              if (!parsed && obj.data) {
                console.log(
                  `[CalDAV:${this.providerId}] Failed to parse object:`,
                  obj.data?.slice(0, 300),
                )
              }
              if (parsed) allEvents.push(parsed)
            }
          } catch (err) {
            console.error(
              `[CalDAV:${this.providerId}] Failed to fetch events from ${cal.displayName}:`,
              err,
            )
          }
        }),
      )

      return allEvents.sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      )
    } catch (err) {
      console.error(`[CalDAV:${this.providerId}] Failed to list events:`, err)
      return []
    }
  }

  async createEvent(input: CreateEventInput): Promise<CalendarEvent> {
    const client = await this.createClient()
    const calendars = await client.fetchCalendars()
    const calendar = calendars.find((c: DAVCalendar) => c.url === input.calendarId)
    if (!calendar) throw new Error(`Calendar not found: ${input.calendarId}`)

    const uid = randomUUID()
    const iCalString = buildVCalendar(input, uid)
    const filename = `${uid}.ics`

    await client.createCalendarObject({
      calendar,
      iCalString,
      filename,
    })

    return {
      id: uid,
      calendarId: input.calendarId,
      title: input.title,
      description: input.description,
      location: input.location,
      allDay: input.allDay ?? false,
      start: input.start,
      end: input.end,
      recurrence: input.recurrence,
      availability: input.availability === "free" ? "free" : "busy",
      visibility: input.visibility,
      providerData: {
        url: `${input.calendarId}${filename}`,
        etag: "",
      },
    }
  }

  async updateEvent(input: UpdateEventInput): Promise<CalendarEvent> {
    const client = await this.createClient()
    const calendars = await client.fetchCalendars()
    const calendar = calendars.find((c: DAVCalendar) => c.url === input.calendarId)
    if (!calendar) throw new Error(`Calendar not found: ${input.calendarId}`)

    const objects = await client.fetchCalendarObjects({ calendar })
    const existing = objects.find((obj: DAVObject) => {
      if (!obj.data) return false
      const uidMatch = obj.data.match(/^UID:(.*)$/m)
      return uidMatch?.[1]?.trim() === input.eventId
    })

    if (!existing) throw new Error(`Event not found: ${input.eventId}`)

    const parsed = parseVEvent(existing, input.calendarId)
    if (!parsed) throw new Error(`Failed to parse existing event: ${input.eventId}`)

    const merged: CreateEventInput = {
      calendarId: input.calendarId,
      title: input.title ?? parsed.title,
      description: input.description ?? parsed.description,
      start: input.start ?? parsed.start,
      end: input.end ?? parsed.end,
      allDay: input.allDay ?? parsed.allDay,
      location: input.location ?? parsed.location,
      recurrence: input.recurrence ?? parsed.recurrence,
      attendees: input.attendees ?? parsed.attendees?.map((a) => ({
        email: a.email,
        name: a.name,
        role: a.role === "optional" ? "optional" as const : "required" as const,
      })),
      availability: input.availability ?? (parsed.availability === "free" ? "free" : "busy"),
      visibility: input.visibility ?? parsed.visibility,
    }

    const iCalString = buildVCalendar(merged, input.eventId)

    await client.updateCalendarObject({
      calendarObject: {
        url: existing.url,
        etag: existing.etag ?? undefined,
        data: iCalString,
      },
    })

    return {
      ...parsed,
      ...Object.fromEntries(
        Object.entries(input).filter(([_, v]) => v !== undefined),
      ),
      id: input.eventId,
      calendarId: input.calendarId,
      providerData: {
        url: existing.url ?? "",
        etag: existing.etag ?? "",
      },
    }
  }

  async deleteEvent(input: DeleteEventInput): Promise<void> {
    const client = await this.createClient()
    const calendars = await client.fetchCalendars()
    const calendar = calendars.find((c: DAVCalendar) => c.url === input.calendarId)
    if (!calendar) throw new Error(`Calendar not found: ${input.calendarId}`)

    const objects = await client.fetchCalendarObjects({ calendar })
    const existing = objects.find((obj: DAVObject) => {
      if (!obj.data) return false
      const uidMatch = obj.data.match(/^UID:(.*)$/m)
      return uidMatch?.[1]?.trim() === input.eventId
    })

    if (!existing) throw new Error(`Event not found: ${input.eventId}`)

    await client.deleteCalendarObject({
      calendarObject: {
        url: existing.url,
        etag: existing.etag ?? undefined,
      },
    })
  }
}
