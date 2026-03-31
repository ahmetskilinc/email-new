"use client"

import { getMessageAttachments } from "@/server/actions/mail"
import { useQuery } from "@tanstack/react-query"
import { useSession } from "@/lib/auth-client"

export const useAttachments = (messageId: string) => {
  const { data: session } = useSession()

  return useQuery({
    queryKey: ["attachments", messageId],
    queryFn: () => getMessageAttachments(messageId),
    enabled: !!session?.user.id && !!messageId,
    staleTime: 1000 * 60 * 60,
  })
}
