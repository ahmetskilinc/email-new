"use client"

import { Avatar } from "bruv-ui"
import { getBimiByEmail } from "@/server/actions/bimi"
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
  const { data: bimiUrl } = useQuery({
    queryKey: ["bimi", email],
    queryFn: () => getBimiByEmail(email || ""),
    enabled: !!email,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24 * 7,
  })

  const firstLetter = getFirstLetter(name || email)

  return (
    <Avatar
      size="md"
      src={bimiUrl ?? undefined}
      initials={firstLetter}
      alt={name || email}
    />
  )
}
