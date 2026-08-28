"use client"

import {
  listConnections,
  getDefaultConnection,
} from "@/server/actions/connections"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSessionSnapshot } from "@/providers/session-provider"

export function activeConnectionQueryKey(userId: string | undefined | null) {
  return ["activeConnection", userId ?? "anon"] as const
}

export const useConnections = () => {
  const { uid } = useSessionSnapshot()

  return useQuery({
    queryKey: ["connections", uid],
    queryFn: () => listConnections(),
  })
}

export const useActiveConnection = () => {
  const { uid, dcid } = useSessionSnapshot()
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: activeConnectionQueryKey(uid),
    queryFn: () => getDefaultConnection(),
    staleTime: 1000 * 60 * 5,
    // The proxy forwards defaultConnectionId with the session snapshot, so the
    // active connection is known on frame one: resolve it against whatever
    // connections list is already cached (restored from IndexedDB) instead of
    // blocking the threads query on a round trip.
    placeholderData: () => {
      if (!dcid) return undefined
      const cached = queryClient.getQueryData<
        Awaited<ReturnType<typeof listConnections>>
      >(["connections", uid])
      return cached?.connections.find((c) => c.id === dcid) ?? undefined
    },
  })
}
