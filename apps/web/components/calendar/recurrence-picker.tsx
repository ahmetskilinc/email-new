"use client"

import * as React from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { getRecurrencePresets, describeRRule } from "@/lib/recurrence"

interface RecurrencePickerProps {
  value: string | null
  onChange: (value: string | null) => void
  date: Date
}

export function RecurrencePicker({ value, onChange, date }: RecurrencePickerProps) {
  const presets = React.useMemo(() => getRecurrencePresets(date), [date])

  const selectedLabel = React.useMemo(() => {
    if (!value) return "Does not repeat"
    const preset = presets.find((p) => p.value === value)
    if (preset) return preset.label
    return describeRRule(value)
  }, [value, presets])

  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(val) => onChange(val === "__none__" ? null : val)}
    >
      <SelectTrigger className="w-full">
        <SelectValue>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {presets.map((preset) => (
          <SelectItem
            key={preset.value ?? "__none__"}
            value={preset.value ?? "__none__"}
          >
            {preset.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
