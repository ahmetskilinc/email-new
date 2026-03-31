export interface CalendarInfo {
  id: string
  name: string
  color?: string
  description?: string
  primary: boolean
  readOnly: boolean
  accessRole?: string
}

export interface CalendarEventAttendee {
  email: string
  name?: string
  status?: "accepted" | "tentative" | "declined" | "needsAction" | string
  role?: "required" | "optional" | "resource"
  self?: boolean
}

export interface CalendarEvent {
  id: string
  calendarId: string
  title: string
  description?: string
  location?: string
  allDay: boolean
  start: string
  end: string
  status?: string
  color?: string
  attendees?: CalendarEventAttendee[]
  recurringEventId?: string
  recurrence?: string[]
  conferenceLink?: string
  organizer?: { email: string; name?: string; self?: boolean }
  visibility?: "default" | "public" | "private" | "confidential"
  availability?: "busy" | "free" | "tentative"
  htmlLink?: string
  providerData?: Record<string, string>
}

export interface ListEventsOptions {
  timeMin: Date
  timeMax: Date
  calendarId?: string
}

export type RecurringEventScope = "single" | "all" | "thisAndFollowing"

export interface CreateEventInput {
  calendarId: string
  title: string
  description?: string
  start: string
  end: string
  allDay?: boolean
  location?: string
  recurrence?: string[]
  attendees?: { email: string; name?: string; role?: "required" | "optional" }[]
  availability?: "busy" | "free"
  visibility?: "default" | "public" | "private" | "confidential"
  color?: string
  conferenceLink?: string
}

export interface UpdateEventInput {
  eventId: string
  calendarId: string
  scope?: RecurringEventScope
  title?: string
  description?: string
  start?: string
  end?: string
  allDay?: boolean
  location?: string
  recurrence?: string[]
  attendees?: { email: string; name?: string; role?: "required" | "optional" }[]
  availability?: "busy" | "free"
  visibility?: "default" | "public" | "private" | "confidential"
  color?: string
}

export interface DeleteEventInput {
  eventId: string
  calendarId: string
  scope?: RecurringEventScope
  sendNotifications?: boolean
}

export interface CreateCalendarInput {
  name: string
  color?: string
}

export interface UpdateCalendarInput {
  calendarId: string
  name?: string
  color?: string
}

export interface CalendarProvider {
  listCalendars(): Promise<CalendarInfo[]>
  listEvents(options: ListEventsOptions): Promise<CalendarEvent[]>
  createEvent(input: CreateEventInput): Promise<CalendarEvent>
  updateEvent(input: UpdateEventInput): Promise<CalendarEvent>
  deleteEvent(input: DeleteEventInput): Promise<void>
  createCalendar?(input: CreateCalendarInput): Promise<CalendarInfo>
  updateCalendar?(input: UpdateCalendarInput): Promise<CalendarInfo>
  deleteCalendar?(calendarId: string): Promise<void>
}

export interface CalendarProviderConfig {
  accessToken: string
  refreshToken: string
  email: string
}
