"use client"

import {
  listConnections,
  getDefaultConnection,
} from "@/server/actions/connections"
import { useQuery } from "@tanstack/react-query"
import { useSession } from "@/lib/auth-client"

export const useConnections = () => {
  const { data: session } = useSession()
  const userId = session?.user?.id

  return useQuery({
    queryKey: ["connections", userId ?? "anon"],
    queryFn: () => listConnections(),
  })
}

export const useActiveConnection = () => {
  const { data: session } = useSession()
  const userId = session?.user?.id

  return useQuery({
    queryKey: ["activeConnection", userId ?? "anon"],
    queryFn: () => getDefaultConnection(),
    staleTime: 1000 * 30,
    refetchOnMount: true,
  })
}
