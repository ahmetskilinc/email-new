"use client"

import { ErrorBoundaryFallback } from "@/components/error-boundary-fallback"

export default function MailError({
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
      title="Mail error"
      description="Something went wrong loading your mail. Please try again."
    />
  )
}
