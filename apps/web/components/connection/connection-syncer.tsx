"use client"

import { connectionIdRef } from "@/providers/query-provider"
import { useActiveConnection } from "@/hooks/use-connections"
import { activeConnectionIdAtom } from "@/store/connection"
import { useSetAtom } from "jotai"
import { useEffect, useRef } from "react"

export function ConnectionSyncer() {
  const { data: connection } = useActiveConnection()
  const setConnectionId = useSetAtom(activeConnectionIdAtom)
  const prevIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!connection?.id) return
    if (connection.id === prevIdRef.current) return
    prevIdRef.current = connection.id
    setConnectionId(connection.id)
    connectionIdRef.current = connection.id
  }, [connection?.id, setConnectionId])

  return null
}
