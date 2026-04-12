import { useCallback, useEffect, useRef, useState } from "react"
import { Input } from "@workspace/ui/components/input"
import { searchRecipients } from "@/lib/api"
import { cn } from "@workspace/ui/lib/utils"

interface RecipientInputProps {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  disabled?: boolean
  "aria-invalid"?: boolean
}

interface Suggestion {
  email: string
  name: string | null
}

export function RecipientInput({
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  "aria-invalid": ariaInvalid,
}: RecipientInputProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const getCurrentToken = useCallback(() => {
    const parts = value.split(",")
    return parts[parts.length - 1]?.trim() ?? ""
  }, [value])

  useEffect(() => {
    const token = getCurrentToken()
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (token.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchRecipients(token)
        setSuggestions(results)
        setShowSuggestions(results.length > 0)
        setActiveIndex(-1)
      } catch {
        setSuggestions([])
        setShowSuggestions(false)
      }
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [getCurrentToken])

  const selectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      const parts = value.split(",").map((s) => s.trim()).filter(Boolean)
      parts.pop()
      parts.push(suggestion.email)
      onChange(parts.join(", ") + ", ")
      setShowSuggestions(false)
      setSuggestions([])
      inputRef.current?.focus()
    },
    [value, onChange],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault()
      selectSuggestion(suggestions[activeIndex]!)
    } else if (e.key === "Escape") {
      setShowSuggestions(false)
    }
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative w-full">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setShowSuggestions(true)
        }}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={ariaInvalid}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {suggestions.map((s, i) => (
            <button
              key={s.email}
              type="button"
              className={cn(
                "flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                i === activeIndex && "bg-muted",
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                selectSuggestion(s)
              }}
            >
              {s.name ? (
                <>
                  <span className="text-sm">{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {s.email}
                  </span>
                </>
              ) : (
                <span className="text-sm">{s.email}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
