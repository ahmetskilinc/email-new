"use server"

import { requireSession } from "../lib/session"
import { getActiveConnection, getzeitmailDB, resolveAccessToken } from "../lib/server-utils"
import { createCalendarProvider } from "../lib/calendar"
import type { CalendarEvent, CalendarInfo } from "../lib/calendar"
import { createEventSchema, updateEventSchema, deleteEventSchema } from "../lib/schemas"
import type { CreateEventData, UpdateEventData, DeleteEventData } from "../lib/schemas"

async function resolveConnection(userId: string, connectionId?: string) {
  if (connectionId) {
    const db = await getzeitmailDB(userId)
    const c = await db.findUserConnection(connectionId)
    if (!c) throw new Error("Connection not found")
    return c
  }
  return getActiveConnection(userId)
}

function getProvider(connection: any) {
  return createCalendarProvider(connection.providerId, {
    accessToken: resolveAccessToken(connection),
    refreshToken: connection.refreshToken ?? "",
    email: connection.email,
  })
}

export async function getCalendarEvents(params: {
  timeMin: string
  timeMax: string
  connectionId?: string
}): Promise<CalendarEvent[]> {
  const session = await requireSession()
  const connection = await resolveConnection(session.user.id, params.connectionId)
  const provider = getProvider(connection)

  const events = await provider.listEvents({
    timeMin: new Date(params.timeMin),
    timeMax: new Date(params.timeMax),
  })

  console.log(
    `[Calendar] ${connection.providerId}/${connection.email}: ${events.length} events fetched`,
  )

  return events
}

export async function getCalendars(connectionId?: string): Promise<CalendarInfo[]> {
  const session = await requireSession()
  const connection = await resolveConnection(session.user.id, connectionId)
  const provider = getProvider(connection)
  return provider.listCalendars()
}

export async function createCalendarEvent(
  data: CreateEventData,
  connectionId?: string,
): Promise<CalendarEvent> {
  const session = await requireSession()
  const validated = createEventSchema.parse(data)
  const connection = await resolveConnection(session.user.id, connectionId)
  const provider = getProvider(connection)

  const event = await provider.createEvent(validated)

  console.log(
    `[Calendar] ${connection.providerId}/${connection.email}: event created "${validated.title}"`,
  )

  return event
}

export async function updateCalendarEvent(
  data: UpdateEventData,
  connectionId?: string,
): Promise<CalendarEvent> {
  const session = await requireSession()
  const validated = updateEventSchema.parse(data)
  const connection = await resolveConnection(session.user.id, connectionId)
  const provider = getProvider(connection)

  const event = await provider.updateEvent(validated)

  console.log(
    `[Calendar] ${connection.providerId}/${connection.email}: event updated "${validated.eventId}"`,
  )

  return event
}

export async function deleteCalendarEvent(
  data: DeleteEventData,
  connectionId?: string,
): Promise<void> {
  const session = await requireSession()
  const validated = deleteEventSchema.parse(data)
  const connection = await resolveConnection(session.user.id, connectionId)
  const provider = getProvider(connection)

  await provider.deleteEvent(validated)

  console.log(
    `[Calendar] ${connection.providerId}/${connection.email}: event deleted "${validated.eventId}"`,
  )
}
