"use client"

import { ErrorBoundaryFallback } from "@/components/error-boundary-fallback"

export default function CalendarError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorBoundaryFallback
      error={error}
      reset={reset}
      title="Calendar error"
      description="Something went wrong loading your calendar. Please try again."
    />
  )
}
