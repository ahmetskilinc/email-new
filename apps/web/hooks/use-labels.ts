"use client"

import { listLabels } from "@/server/actions/labels"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

const desiredSystemLabels = new Set([
  "IMPORTANT",
  "FORUMS",
  "PROMOTIONS",
  "SOCIAL",
  "UPDATES",
  "STARRED",
  "UNREAD",
])

export function useLabels() {
  const labelQuery = useQuery({
    queryKey: ["labels"],
    queryFn: () => listLabels(),
    staleTime: 1000 * 60 * 60,
  })

  const { userLabels, systemLabels } = useMemo(() => {
    if (!labelQuery.data) return { userLabels: [], systemLabels: [] }
    const cleanedName = labelQuery.data
      .filter((label) => label.type === "system")
      .map((label) => ({
        ...label,
        name: label.name.replace("CATEGORY_", ""),
      }))
    const cleanedSystemLabels = cleanedName.filter((label) =>
      desiredSystemLabels.has(label.name),
    )
    return {
      userLabels: labelQuery.data.filter((label) => label.type === "user"),
      systemLabels: cleanedSystemLabels,
    }
  }, [labelQuery.data])

  return { userLabels, systemLabels, ...labelQuery }
}
