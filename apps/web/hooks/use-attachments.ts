"use client"

import { getMessageAttachments } from "@/server/actions/mail"
import { useQuery } from "@tanstack/react-query"

export const useAttachments = (messageId: string) => {
  return useQuery({
    queryKey: ["attachments", messageId],
    queryFn: () => getMessageAttachments(messageId),
    enabled: !!messageId,
    staleTime: 1000 * 60 * 60,
  })
}
