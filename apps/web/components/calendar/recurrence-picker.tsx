"use client"

import * as React from "react"
import {
  Select,
  SelectButton,
  SelectContent,
  SelectOption,
} from "bruv-ui"
import { getRecurrencePresets, describeRRule } from "@/lib/recurrence"

interface RecurrencePickerProps {
  value: string | null
  onChange: (value: string | null) => void
  date: Date
}

export function RecurrencePicker({
  value,
  onChange,
  date,
}: RecurrencePickerProps) {
  const presets = React.useMemo(() => getRecurrencePresets(date), [date])

  const selectedLabel = React.useMemo(() => {
    if (!value) return "Does not repeat"
    const preset = presets.find((p) => p.value === value)
    if (preset) return preset.label
    return describeRRule(value)
  }, [value, presets])

  const items = React.useMemo(() => {
    const base = presets.map((p) => ({
      value: p.value ?? "__none__",
      label: p.label,
    }))
    const current = value ?? "__none__"
    if (!base.some((i) => i.value === current)) {
      base.push({ value: current, label: selectedLabel })
    }
    return base
  }, [presets, value, selectedLabel])

  return (
    <Select
      value={value ?? "__none__"}
      onValueChange={(val) => onChange(val === "__none__" ? null : val)}
      items={items}
    >
      <SelectButton size="sm" className="w-full" />
      <SelectContent>
        {presets.map((preset) => (
          <SelectOption
            key={preset.value ?? "__none__"}
            value={preset.value ?? "__none__"}
          >
            {preset.label}
          </SelectOption>
        ))}
      </SelectContent>
    </Select>
  )
}
