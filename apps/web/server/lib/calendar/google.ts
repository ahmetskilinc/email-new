import { calendar } from "@googleapis/calendar"
import { OAuth2Client } from "google-auth-library"
import { env } from "../../env"
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

export class GoogleCalendarProvider implements CalendarProvider {
  private cal

  constructor(private config: CalendarProviderConfig) {
    const auth = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
    auth.setCredentials({ refresh_token: config.refreshToken })
    this.cal = calendar({ version: "v3", auth })
  }

  async listCalendars(): Promise<CalendarInfo[]> {
    const res = await this.cal.calendarList.list({ minAccessRole: "reader" })
    return (res.data.items ?? []).map((c) => ({
      id: c.id ?? "",
      name: c.summary ?? "",
      color: c.backgroundColor ?? undefined,
      primary: c.primary ?? false,
      readOnly: c.accessRole === "reader" || c.accessRole === "freeBusyReader",
      accessRole: c.accessRole ?? undefined,
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
          const res = await this.cal.events.list({
            calendarId: calId,
            timeMin: options.timeMin.toISOString(),
            timeMax: options.timeMax.toISOString(),
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 250,
          })

          for (const e of res.data.items ?? []) {
            if (e.status === "cancelled") continue

            const isAllDay = !!e.start?.date
            allEvents.push({
              id: e.id ?? "",
              calendarId: calId,
              title: e.summary ?? "(untitled)",
              description: e.description ?? undefined,
              location: e.location ?? undefined,
              allDay: isAllDay,
              start: isAllDay ? e.start!.date! : e.start!.dateTime!,
              end: isAllDay ? e.end!.date! : e.end!.dateTime!,
              status: e.status ?? undefined,
              color: e.colorId ?? undefined,
              attendees: e.attendees?.map((a) => ({
                email: a.email ?? "",
                name: a.displayName ?? undefined,
                status: a.responseStatus ?? undefined,
                self: a.self ?? undefined,
              })),
              recurringEventId: e.recurringEventId ?? undefined,
              recurrence: e.recurrence ?? undefined,
              conferenceLink:
                e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ??
                e.hangoutLink ??
                undefined,
              organizer: e.organizer
                ? {
                    email: e.organizer.email ?? "",
                    name: e.organizer.displayName ?? undefined,
                    self: e.organizer.self ?? undefined,
                  }
                : undefined,
              visibility: (e.visibility as CalendarEvent["visibility"]) ?? undefined,
              availability: e.transparency === "transparent" ? "free" : "busy",
              htmlLink: e.htmlLink ?? undefined,
            })
          }
        } catch (err) {
          console.error(`[GoogleCalendar] Failed to list events for ${calId}:`, err)
        }
      }),
    )

    return allEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  }

  async createEvent(input: CreateEventInput): Promise<CalendarEvent> {
    const isAllDay = input.allDay ?? false

    const requestBody: Record<string, any> = {
      summary: input.title,
      description: input.description,
      location: input.location,
      start: isAllDay ? { date: input.start } : { dateTime: input.start },
      end: isAllDay ? { date: input.end } : { dateTime: input.end },
      recurrence: input.recurrence,
      visibility: input.visibility === "default" ? undefined : input.visibility,
      transparency: input.availability === "free" ? "transparent" : "opaque",
      colorId: input.color,
    }

    if (input.attendees?.length) {
      requestBody.attendees = input.attendees.map((a) => ({
        email: a.email,
        displayName: a.name,
        optional: a.role === "optional",
      }))
    }

    const res = await this.cal.events.insert({
      calendarId: input.calendarId,
      requestBody,
      sendUpdates: input.attendees?.length ? "all" : "none",
    })

    const e = res.data
    const resultAllDay = !!e.start?.date
    return {
      id: e.id ?? "",
      calendarId: input.calendarId,
      title: e.summary ?? input.title,
      description: e.description ?? undefined,
      location: e.location ?? undefined,
      allDay: resultAllDay,
      start: resultAllDay ? e.start!.date! : e.start!.dateTime!,
      end: resultAllDay ? e.end!.date! : e.end!.dateTime!,
      status: e.status ?? undefined,
      color: e.colorId ?? undefined,
      recurrence: e.recurrence ?? undefined,
      htmlLink: e.htmlLink ?? undefined,
    }
  }

  async updateEvent(input: UpdateEventInput): Promise<CalendarEvent> {
    const requestBody: Record<string, any> = {}

    if (input.title !== undefined) requestBody.summary = input.title
    if (input.description !== undefined) requestBody.description = input.description
    if (input.location !== undefined) requestBody.location = input.location
    if (input.visibility !== undefined) requestBody.visibility = input.visibility
    if (input.availability !== undefined)
      requestBody.transparency = input.availability === "free" ? "transparent" : "opaque"
    if (input.color !== undefined) requestBody.colorId = input.color
    if (input.recurrence !== undefined) requestBody.recurrence = input.recurrence

    if (input.start !== undefined || input.end !== undefined || input.allDay !== undefined) {
      const isAllDay = input.allDay ?? false
      if (input.start !== undefined) {
        requestBody.start = isAllDay ? { date: input.start } : { dateTime: input.start }
      }
      if (input.end !== undefined) {
        requestBody.end = isAllDay ? { date: input.end } : { dateTime: input.end }
      }
    }

    if (input.attendees !== undefined) {
      requestBody.attendees = input.attendees.map((a) => ({
        email: a.email,
        displayName: a.name,
        optional: a.role === "optional",
      }))
    }

    const res = await this.cal.events.patch({
      calendarId: input.calendarId,
      eventId: input.eventId,
      requestBody,
      sendUpdates: input.attendees !== undefined ? "all" : "none",
    })

    const e = res.data
    const resultAllDay = !!e.start?.date
    return {
      id: e.id ?? "",
      calendarId: input.calendarId,
      title: e.summary ?? "",
      description: e.description ?? undefined,
      location: e.location ?? undefined,
      allDay: resultAllDay,
      start: resultAllDay ? e.start!.date! : e.start!.dateTime!,
      end: resultAllDay ? e.end!.date! : e.end!.dateTime!,
      status: e.status ?? undefined,
      color: e.colorId ?? undefined,
      recurrence: e.recurrence ?? undefined,
      htmlLink: e.htmlLink ?? undefined,
    }
  }

  async deleteEvent(input: DeleteEventInput): Promise<void> {
    await this.cal.events.delete({
      calendarId: input.calendarId,
      eventId: input.eventId,
      sendUpdates: input.sendNotifications ? "all" : "none",
    })
  }
}
