"use client"

import { Avatar } from "bruv-ui"
import { getBimiByEmail } from "@/server/actions/bimi"
import { useSettings } from "@/hooks/use-settings"
import { useMemo } from "react"
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
  const { data: settingsData } = useSettings()

  // The BIMI logo lives on a host the sender chooses, so loading it is remote
  // content and leaks a read receipt exactly like a tracking pixel. It has to
  // obey the same external-images decision the message body does — otherwise
  // the sender gets a confirmed open even with images "off".
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
    // Not even the DNS lookup runs when remote content is disallowed.
    enabled: !!email && remoteImagesAllowed,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24 * 7,
  })

  const firstLetter = getFirstLetter(name || email)

  return (
    <Avatar
      size="md"
      src={remoteImagesAllowed ? (bimiUrl ?? undefined) : undefined}
      initials={firstLetter}
      alt={name || email}
    />
  )
}
