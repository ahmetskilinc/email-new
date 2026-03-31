"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { getBimiByEmail } from "@/server/actions/bimi"
import { useState, useCallback } from "react"
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

  const { data: bimiUrl } = useQuery({
    queryKey: ["bimi", email],
    queryFn: () => getBimiByEmail(email || ""),
    enabled: !!email && !useDefaultFallback,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24 * 7,
  })

  const handleError = useCallback(() => {
    setUseDefaultFallback(true)
  }, [])

  const firstLetter = getFirstLetter(name || email)

  return (
    <Avatar className="size-8">
      {bimiUrl && (
        <AvatarImage src={bimiUrl} onError={handleError} />
      )}
      <AvatarFallback className="text-xs">{firstLetter}</AvatarFallback>
    </Avatar>
  )
}
