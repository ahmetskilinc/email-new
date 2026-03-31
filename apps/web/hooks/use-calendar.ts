"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getCalendarEvents,
  getCalendars,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/server/actions/calendar"
import { useActiveConnection } from "./use-connections"
import type { CreateEventData, UpdateEventData, DeleteEventData } from "@/server/lib/schemas"

export function useCalendarEvents(timeMin: Date | null, timeMax: Date | null) {
  const { data: connection } = useActiveConnection()

  return useQuery({
    queryKey: [
      "calendarEvents",
      connection?.id,
      timeMin?.toISOString(),
      timeMax?.toISOString(),
    ],
    queryFn: () =>
      getCalendarEvents({
        timeMin: timeMin!.toISOString(),
        timeMax: timeMax!.toISOString(),
        connectionId: connection?.id,
      }),
    enabled: !!connection?.id && !!timeMin && !!timeMax,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
  })
}

export function useCalendars() {
  const { data: connection } = useActiveConnection()

  return useQuery({
    queryKey: ["calendars", connection?.id],
    queryFn: () => getCalendars(connection?.id),
    enabled: !!connection?.id,
    staleTime: 1000 * 60 * 30,
  })
}

export function useCreateEvent() {
  const queryClient = useQueryClient()
  const { data: connection } = useActiveConnection()

  return useMutation({
    mutationFn: (data: CreateEventData) => createCalendarEvent(data, connection?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarEvents"] })
    },
  })
}

export function useUpdateEvent() {
  const queryClient = useQueryClient()
  const { data: connection } = useActiveConnection()

  return useMutation({
    mutationFn: (data: UpdateEventData) => updateCalendarEvent(data, connection?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarEvents"] })
    },
  })
}

export function useDeleteEvent() {
  const queryClient = useQueryClient()
  const { data: connection } = useActiveConnection()

  return useMutation({
    mutationFn: (data: DeleteEventData) => deleteCalendarEvent(data, connection?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarEvents"] })
    },
  })
}
