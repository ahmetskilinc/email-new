import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export const useCalendarEvents = (timeMin: string, timeMax: string) => {
  return useQuery({
    queryKey: ["calendarEvents", timeMin, timeMax],
    queryFn: () => window.api.calendar.getEvents(timeMin, timeMax),
    enabled: !!timeMin && !!timeMax,
    staleTime: 60 * 1000,
  })
}

export const useCalendars = () => {
  return useQuery({
    queryKey: ["calendars"],
    queryFn: () => window.api.calendar.getCalendars(),
    staleTime: 5 * 60 * 1000,
  })
}

export const useCreateCalendarEvent = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: unknown) => window.api.calendar.createEvent(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarEvents"] })
    },
  })
}

export const useUpdateCalendarEvent = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: unknown) => window.api.calendar.updateEvent(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarEvents"] })
    },
  })
}

export const useDeleteCalendarEvent = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: unknown) => window.api.calendar.deleteEvent(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendarEvents"] })
    },
  })
}
