"use client"

import { listSignatures } from "@/server/actions/signatures"
import { useQuery } from "@tanstack/react-query"

export function useSignatures(connectionId?: string | null) {
  return useQuery({
    queryKey: ["signatures", connectionId ?? "all"],
    queryFn: () => listSignatures(connectionId ?? undefined),
  })
}
