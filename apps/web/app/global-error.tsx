"use client"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden">
        <div role="alert" aria-live="assertive" className="flex min-h-dvh w-full items-center justify-center text-center">
          <div className="flex flex-col items-center gap-4">
            <h1 aria-hidden="true" className="select-none text-[120px] font-bold leading-none text-gray-200">
              !
            </h1>
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-semibold">Something went wrong</h2>
              <p className="text-sm text-gray-500">
                A critical error occurred. Please try again.
              </p>
            </div>
            <button
              onClick={reset}
              className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium hover:bg-gray-200"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
