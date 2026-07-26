"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { getBimiByEmail } from "@/server/actions/bimi"
import { useSettings } from "@/hooks/use-settings"
import { useState, useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

const getFirstLetter = (name?: string) => {
  if (!name) return ""
  const match = name.match(/[a-zA-Z]/)
  return match ? match[0]!.toUpperCase() : ""
}

interface BimiAvatarProps {
  email?: string
  name?: string
}

export function BimiAvatar({ email, name }: BimiAvatarProps) {
  const [useDefaultFallback, setUseDefaultFallback] = useState(false)
  const { data: settingsData } = useSettings()

  // The BIMI logo lives on a host the sender chooses, so loading it is remote
  // content and leaks a read receipt just like a tracking pixel. It has to obey
  // the same external-images decision the message body does.
  const settings = settingsData?.settings
  const remoteImagesAllowed = useMemo(
    () =>
      !!(
        settings?.externalImages ||
        (email && settings?.trustedSenders?.includes(email))
      ),
    [settings, email]
  )

  const { data: bimiUrl } = useQuery({
    queryKey: ["bimi", email],
    queryFn: () => getBimiByEmail(email || ""),
    enabled: !!email && !useDefaultFallback && remoteImagesAllowed,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24 * 7,
  })

  const handleError = useCallback(() => {
    setUseDefaultFallback(true)
  }, [])

  const firstLetter = getFirstLetter(name || email)

  return (
    <Avatar className="size-8">
      {remoteImagesAllowed && bimiUrl && (
        <AvatarImage src={bimiUrl} onError={handleError} />
      )}
      <AvatarFallback className="text-xs">{firstLetter}</AvatarFallback>
    </Avatar>
  )
}
