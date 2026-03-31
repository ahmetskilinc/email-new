import type { EProviders } from "../../types"
import type { CalendarProvider, CalendarProviderConfig } from "./types"
import { GoogleCalendarProvider } from "./google"
import { MicrosoftCalendarProvider } from "./microsoft"
import { CalDAVCalendarProvider } from "./caldav"

export function createCalendarProvider(
  providerId: EProviders | (string & {}),
  config: CalendarProviderConfig,
): CalendarProvider {
  switch (providerId) {
    case "google":
      return new GoogleCalendarProvider(config)
    case "microsoft":
      return new MicrosoftCalendarProvider(config)
    case "icloud":
      return new CalDAVCalendarProvider(config, "icloud")
    case "yahoo":
      return new CalDAVCalendarProvider(config, "yahoo")
    default:
      throw new Error(`Calendar provider not supported for: ${providerId}`)
  }
}

export type {
  CalendarProvider,
  CalendarProviderConfig,
  CalendarInfo,
  CalendarEvent,
  CalendarEventAttendee,
  ListEventsOptions,
  CreateEventInput,
  UpdateEventInput,
  DeleteEventInput,
  CreateCalendarInput,
  UpdateCalendarInput,
  RecurringEventScope,
} from "./types"
