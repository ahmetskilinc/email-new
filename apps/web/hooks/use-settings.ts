"use client"

import { getSettings } from "@/server/actions/settings"
import { useQuery } from "@tanstack/react-query"
import { useSession } from "@/lib/auth-client"

export function useSettings() {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ["settings", session?.user?.id],
    queryFn: () => getSettings(),
    enabled: !!session?.user?.id,
    staleTime: Infinity,
  })
}
