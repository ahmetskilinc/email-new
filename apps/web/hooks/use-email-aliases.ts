"use client"

import { getEmailAliases } from "@/server/actions/mail"
import { useQuery } from "@tanstack/react-query"

export function useEmailAliases() {
  return useQuery({
    queryKey: ["emailAliases"],
    queryFn: () => getEmailAliases(),
    staleTime: 1000 * 60 * 60,
  })
}
