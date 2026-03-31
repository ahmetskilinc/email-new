"use client"

import { getDraft } from "@/server/actions/drafts"
import { useQuery } from "@tanstack/react-query"

export function useDraft(draftId: string | null) {
  return useQuery({
    queryKey: ["draft", draftId],
    queryFn: () => getDraft(draftId!),
    enabled: !!draftId,
    staleTime: 1000 * 60 * 5,
  })
}
