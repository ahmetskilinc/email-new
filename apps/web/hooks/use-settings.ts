"use client"

import { getSettings } from "@/server/actions/settings"
import { useQuery } from "@tanstack/react-query"
import { useSessionSnapshot } from "@/providers/session-provider"

export function useSettings() {
  const { uid } = useSessionSnapshot()

  return useQuery({
    queryKey: ["settings", uid],
    queryFn: () => getSettings(),
    staleTime: Infinity,
  })
}
