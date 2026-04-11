"use client"

import { Button } from "@workspace/ui/components/button"

export function ErrorBoundaryFallback({
  error,
  reset,
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
}: {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  description?: string
}) {
  return (
    <div className="flex h-full w-full items-center justify-center text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-muted-foreground/20 select-none text-[120px] font-bold leading-none">
          !
        </h1>
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        <Button variant="secondary" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  )
}
