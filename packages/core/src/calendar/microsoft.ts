import { Client } from "@microsoft/microsoft-graph-client"
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

export class MicrosoftCalendarProvider implements CalendarProvider {
  private graphClient: Client

  constructor(private config: CalendarProviderConfig) {
    this.graphClient = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => config.accessToken,
      },
    })
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    const res = await this.graphClient.api("/me/calendars").get()
    return (res.value ?? []).map((c: any) => ({
      id: c.id ?? "",
      name: c.name ?? "",
      color: c.hexColor ?? undefined,
      primary: c.isDefaultCalendar ?? false,
      readOnly: !c.canEdit,
    }))
  }

  async listEvents(options: ListEventsOptions): Promise<CalendarEvent[]> {
    const calendarIds = options.calendarId
      ? [options.calendarId]
      : (await this.listCalendars()).map((c) => c.id)

    const allEvents: CalendarEvent[] = []

    await Promise.all(
      calendarIds.map(async (calId) => {
        try {
          const res = await this.graphClient
            .api(`/me/calendars/${calId}/calendarView`)
            .query({
              startDateTime: options.timeMin.toISOString(),
              endDateTime: options.timeMax.toISOString(),
              $top: 250,
              $orderby: "start/dateTime",
              $select:
                "id,subject,bodyPreview,body,location,start,end,isAllDay,isCancelled,showAs,sensitivity,attendees,organizer,seriesMasterId,recurrence,onlineMeeting,webLink",
            })
            .get()

          for (const e of res.value ?? []) {
            if (e.isCancelled) continue

            allEvents.push({
              id: e.id ?? "",
              calendarId: calId,
              title: e.subject ?? "(untitled)",
              description: e.bodyPreview ?? undefined,
              location: e.location?.displayName ?? undefined,
              allDay: e.isAllDay ?? false,
              start: e.isAllDay
                ? e.start.dateTime.split("T")[0]
                : e.start.dateTime + (e.start.timeZone === "UTC" ? "Z" : ""),
              end: e.isAllDay
                ? e.end.dateTime.split("T")[0]
                : e.end.dateTime + (e.end.timeZone === "UTC" ? "Z" : ""),
              status: e.showAs ?? undefined,
              attendees: e.attendees?.map((a: any) => ({
                email: a.emailAddress?.address ?? "",
                name: a.emailAddress?.name ?? undefined,
                status: mapGraphResponseStatus(a.status?.response),
                role: a.type === "optional" ? "optional" as const : "required" as const,
              })),
              recurringEventId: e.seriesMasterId ?? undefined,
              recurrence: e.recurrence ? [graphRecurrenceToDescription(e.recurrence)] : undefined,
              conferenceLink: e.onlineMeeting?.joinUrl ?? undefined,
              organizer: e.organizer?.emailAddress
                ? {
                    email: e.organizer.emailAddress.address ?? "",
                    name: e.organizer.emailAddress.name ?? undefined,
                  }
                : undefined,
              visibility: mapGraphSensitivity(e.sensitivity),
              availability: mapGraphShowAs(e.showAs),
              htmlLink: e.webLink ?? undefined,
            })
          }
        } catch (err) {
          console.error(`[MicrosoftCalendar] Failed to list events for ${calId}:`, err)
        }
      }),
    )

    return allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  }

  async createEvent(input: CreateEventInput): Promise<CalendarEvent> {
    const isAllDay = input.allDay ?? false
    const body: Record<string, any> = {
      subject: input.title,
      body: input.description ? { contentType: "text", content: input.description } : undefined,
      location: input.location ? { displayName: input.location } : undefined,
      isAllDay,
      start: isAllDay
        ? { dateTime: `${input.start}T00:00:00`, timeZone: "UTC" }
        : { dateTime: input.start.replace("Z", ""), timeZone: "UTC" },
      end: isAllDay
        ? { dateTime: `${input.end}T00:00:00`, timeZone: "UTC" }
        : { dateTime: input.end.replace("Z", ""), timeZone: "UTC" },
      showAs: input.availability === "free" ? "free" : "busy",
      sensitivity: mapVisibilityToSensitivity(input.visibility),
    }

    if (input.attendees?.length) {
      body.attendees = input.attendees.map((a) => ({
        emailAddress: { address: a.email, name: a.name },
        type: a.role === "optional" ? "optional" : "required",
      }))
    }

    if (input.recurrence?.length) {
      const parsed = parseRRuleToGraphRecurrence(input.recurrence[0]!, input.start)
      if (parsed) body.recurrence = parsed
    }

    const res = await this.graphClient
      .api(`/me/calendars/${input.calendarId}/events`)
      .post(body)

    return this.mapGraphEventToCalendarEvent(res, input.calendarId)
  }

  async updateEvent(input: UpdateEventInput): Promise<CalendarEvent> {
    const body: Record<string, any> = {}

    if (input.title !== undefined) body.subject = input.title
    if (input.description !== undefined)
      body.body = { contentType: "text", content: input.description }
    if (input.location !== undefined) body.location = { displayName: input.location }
    if (input.availability !== undefined)
      body.showAs = input.availability === "free" ? "free" : "busy"
    if (input.visibility !== undefined)
      body.sensitivity = mapVisibilityToSensitivity(input.visibility)

    if (input.start !== undefined || input.end !== undefined || input.allDay !== undefined) {
      const isAllDay = input.allDay ?? false
      if (input.start !== undefined) {
        body.start = isAllDay
          ? { dateTime: `${input.start}T00:00:00`, timeZone: "UTC" }
          : { dateTime: input.start.replace("Z", ""), timeZone: "UTC" }
      }
      if (input.end !== undefined) {
        body.end = isAllDay
          ? { dateTime: `${input.end}T00:00:00`, timeZone: "UTC" }
          : { dateTime: input.end.replace("Z", ""), timeZone: "UTC" }
      }
      if (input.allDay !== undefined) body.isAllDay = input.allDay
    }

    if (input.attendees !== undefined) {
      body.attendees = input.attendees.map((a) => ({
        emailAddress: { address: a.email, name: a.name },
        type: a.role === "optional" ? "optional" : "required",
      }))
    }

    if (input.recurrence?.length) {
      const startDate = input.start ?? new Date().toISOString()
      const parsed = parseRRuleToGraphRecurrence(input.recurrence[0]!, startDate)
      if (parsed) body.recurrence = parsed
    }

    const res = await this.graphClient
      .api(`/me/events/${input.eventId}`)
      .patch(body)

    return this.mapGraphEventToCalendarEvent(res, input.calendarId)
  }

  async deleteEvent(input: DeleteEventInput): Promise<void> {
    await this.graphClient.api(`/me/events/${input.eventId}`).delete()
  }

  private mapGraphEventToCalendarEvent(e: any, calendarId: string): CalendarEvent {
    const isAllDay = e.isAllDay ?? false
    return {
      id: e.id ?? "",
      calendarId,
      title: e.subject ?? "",
      description: e.bodyPreview ?? e.body?.content ?? undefined,
      location: e.location?.displayName ?? undefined,
      allDay: isAllDay,
      start: isAllDay
        ? e.start.dateTime.split("T")[0]
        : e.start.dateTime + (e.start.timeZone === "UTC" ? "Z" : ""),
      end: isAllDay
        ? e.end.dateTime.split("T")[0]
        : e.end.dateTime + (e.end.timeZone === "UTC" ? "Z" : ""),
      status: e.showAs ?? undefined,
      conferenceLink: e.onlineMeeting?.joinUrl ?? undefined,
      htmlLink: e.webLink ?? undefined,
    }
  }
}

function mapGraphResponseStatus(status?: string): string | undefined {
  switch (status) {
    case "accepted": return "accepted"
    case "tentativelyAccepted": return "tentative"
    case "declined": return "declined"
    case "notResponded": return "needsAction"
    default: return status
  }
}

function mapGraphSensitivity(sensitivity?: string): CalendarEvent["visibility"] {
  switch (sensitivity) {
    case "normal": return "default"
    case "private": return "private"
    case "confidential": return "confidential"
    case "personal": return "private"
    default: return undefined
  }
}

function mapGraphShowAs(showAs?: string): CalendarEvent["availability"] {
  switch (showAs) {
    case "free": return "free"
    case "tentative": return "tentative"
    case "busy":
    case "oof":
    case "workingElsewhere":
      return "busy"
    default: return undefined
  }
}

function mapVisibilityToSensitivity(visibility?: string): string {
  switch (visibility) {
    case "private": return "private"
    case "confidential": return "confidential"
    case "public":
    case "default":
    default:
      return "normal"
  }
}

function graphRecurrenceToDescription(recurrence: any): string {
  if (!recurrence?.pattern) return ""
  const p = recurrence.pattern
  const parts = [`FREQ=${(p.type ?? "").replace("absolute", "").replace("relative", "").toUpperCase() || "WEEKLY"}`]
  if (p.interval && p.interval > 1) parts.push(`INTERVAL=${p.interval}`)
  if (p.daysOfWeek?.length) {
    const dayMap: Record<string, string> = {
      sunday: "SU", monday: "MO", tuesday: "TU", wednesday: "WE",
      thursday: "TH", friday: "FR", saturday: "SA",
    }
    parts.push(`BYDAY=${p.daysOfWeek.map((d: string) => dayMap[d] ?? d.slice(0, 2).toUpperCase()).join(",")}`)
  }
  if (recurrence.range?.type === "endDate" && recurrence.range.endDate) {
    parts.push(`UNTIL=${recurrence.range.endDate.replace(/-/g, "")}`)
  }
  if (recurrence.range?.type === "numbered" && recurrence.range.numberOfOccurrences) {
    parts.push(`COUNT=${recurrence.range.numberOfOccurrences}`)
  }
  return `RRULE:${parts.join(";")}`
}

function parseRRuleToGraphRecurrence(rrule: string, startDate: string): any | null {
  const ruleStr = rrule.replace(/^RRULE:/, "")
  const parts: Record<string, string> = {}
  for (const part of ruleStr.split(";")) {
    const [key, val] = part.split("=")
    if (key && val) parts[key] = val
  }

  const freq = parts["FREQ"]
  if (!freq) return null

  const dayMap: Record<string, string> = {
    MO: "monday", TU: "tuesday", WE: "wednesday", TH: "thursday",
    FR: "friday", SA: "saturday", SU: "sunday",
  }

  const freqMap: Record<string, string> = {
    DAILY: "daily",
    WEEKLY: "weekly",
    MONTHLY: "absoluteMonthly",
    YEARLY: "absoluteYearly",
  }

  const pattern: Record<string, any> = {
    type: freqMap[freq] ?? "weekly",
    interval: parts["INTERVAL"] ? parseInt(parts["INTERVAL"]) : 1,
  }

  if (parts["BYDAY"]) {
    pattern.daysOfWeek = parts["BYDAY"].split(",").map((d) => dayMap[d] ?? d.toLowerCase())
    if (freq === "MONTHLY") pattern.type = "relativeMonthly"
  }

  if (parts["BYMONTHDAY"]) {
    pattern.dayOfMonth = parseInt(parts["BYMONTHDAY"])
  }

  const range: Record<string, any> = {
    startDate: startDate.split("T")[0],
  }

  if (parts["UNTIL"]) {
    range.type = "endDate"
    const u = parts["UNTIL"]
    range.endDate = u.length === 8 ? `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}` : u.split("T")[0]
  } else if (parts["COUNT"]) {
    range.type = "numbered"
    range.numberOfOccurrences = parseInt(parts["COUNT"])
  } else {
    range.type = "noEnd"
  }

  return { pattern, range }
}
