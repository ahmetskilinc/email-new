"use client"

import {
  listConnections,
  getDefaultConnection,
} from "@/server/actions/connections"
import { useQuery } from "@tanstack/react-query"
import { useSession } from "@/lib/auth-client"

export function activeConnectionQueryKey(userId: string | undefined | null) {
  return ["activeConnection", userId ?? "anon"] as const
}

export const useConnections = () => {
  const { data: session } = useSession()
  const userId = session?.user?.id

  return useQuery({
    queryKey: ["connections", userId ?? "anon"],
    queryFn: () => listConnections(),
    enabled: !!userId,
  })
}

export const useActiveConnection = () => {
  const { data: session } = useSession()
  const userId = session?.user?.id

  return useQuery({
    queryKey: activeConnectionQueryKey(userId),
    queryFn: () => getDefaultConnection(),
    enabled: !!userId,
    staleTime: 1000 * 30,
    refetchOnMount: true,
  })
}
