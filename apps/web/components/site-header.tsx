"use client"

import { DualSidebarTrigger } from "@workspace/ui/components/dual-sidebar"
import { useSearchValue } from "@/hooks/use-search-value"
import { Separator, Input } from "bruv-ui"
import { useParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/16/solid"

export function SiteHeader() {
  const params = useParams<{ folder?: string }>()
  const folder = params?.folder ?? "inbox"
  const title = folder.charAt(0).toUpperCase() + folder.slice(1)

  const [searchValue, setSearchValue] = useSearchValue()
  const [localValue, setLocalValue] = useState(searchValue.value)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchValue.value !== localValue) {
      setLocalValue(searchValue.value)
    }
  }, [searchValue.value])

  const commitSearch = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setSearchValue((prev) => ({ ...prev, value }))
    }, 300)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setLocalValue(val)
    commitSearch(val)
  }

  const handleClear = () => {
    setLocalValue("")
    setSearchValue((prev) => ({ ...prev, value: "" }))
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      handleClear()
      inputRef.current?.blur()
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b pr-2 pl-4">
      <DualSidebarTrigger side="left" className="-ml-2" />
      <Separator orientation="vertical" className="mr-2" />
      <h1 className="shrink-0 text-sm font-medium">{title}</h1>
      <div className="relative ml-auto w-full max-w-xs">
        <MagnifyingGlassIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-bruv-tertiary" />
        <Input
          ref={inputRef}
          data-slot="search-input"
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search mail..."
          className="h-8 pr-8 pl-8 text-sm"
        />
        {localValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-bruv-tertiary hover:text-bruv-primary"
          >
            <XMarkIcon className="size-3.5" />
          </button>
        )}
      </div>
    </header>
  )
}
