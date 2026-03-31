"use client"

import { useSettings } from "@/hooks/use-settings"
import { useMemo } from "react"

export interface CategorySetting {
  id: string
  name: string
  searchValue: string
  order: number
  icon?: string
  isDefault: boolean
}

export function useCategorySettings(): CategorySetting[] {
  const { data } = useSettings()

  return useMemo(() => {
    const overrides =
      (data?.settings.categories as CategorySetting[] | undefined) ?? []
    const sorted = overrides.sort((a, b) => a.order - b.order)

    if (sorted.length === 0) {
      return [
        {
          id: "All Mail",
          name: "All Mail",
          searchValue: "",
          order: 0,
          isDefault: true,
        },
        {
          id: "Unread",
          name: "Unread",
          searchValue: "UNREAD",
          order: 1,
          isDefault: false,
        },
      ]
    }

    return sorted
  }, [data?.settings.categories])
}

export function useDefaultCategoryId(): string {
  const categories = useCategorySettings()
  const defaultCat = categories.find((c) => c.isDefault) ?? categories[0]
  return defaultCat?.id ?? "All Mail"
}
