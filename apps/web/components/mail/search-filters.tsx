"use client"

import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Search01Icon,
  Settings04Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import type { SearchParams } from "@/hooks/use-search"

const FOLDER_OPTIONS = [
  { value: "inbox", label: "Inbox" },
  { value: "sent", label: "Sent" },
  { value: "draft", label: "Drafts" },
  { value: "archive", label: "Archive" },
  { value: "spam", label: "Spam" },
  { value: "bin", label: "Bin" },
]

export function SearchFilters({
  onSearch,
  isLoading,
}: {
  onSearch: (params: SearchParams) => void
  isLoading: boolean
}) {
  const [q, setQ] = useState("")
  const [from, setFrom] = useState("")
  const [after, setAfter] = useState("")
  const [before, setBefore] = useState("")
  const [hasAttachment, setHasAttachment] = useState(false)
  const [folder, setFolder] = useState("inbox")
  const [showFilters, setShowFilters] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch({
      q: q.trim(),
      from: from.trim() || undefined,
      after: after || undefined,
      before: before || undefined,
      hasAttachment: hasAttachment || undefined,
      folder,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-b p-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search emails..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Button type="submit" size="sm" disabled={isLoading}>
          Search
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setShowFilters((v) => !v)}
          title="Toggle filters"
        >
          <HugeiconsIcon icon={Settings04Icon} className="size-4" />
        </Button>
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 md:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">From</Label>
            <Input
              placeholder="sender@..."
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">After</Label>
            <Input
              type="date"
              value={after}
              onChange={(e) => setAfter(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Before</Label>
            <Input
              type="date"
              value={before}
              onChange={(e) => setBefore(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Folder</Label>
            <select
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {FOLDER_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-full flex items-center gap-2">
            <Checkbox
              id="has-attachment"
              checked={hasAttachment}
              onCheckedChange={(v) => setHasAttachment(v === true)}
            />
            <Label htmlFor="has-attachment" className="text-xs">
              Has attachment
            </Label>
          </div>
        </div>
      )}
    </form>
  )
}
