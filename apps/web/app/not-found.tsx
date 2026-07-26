"use client"

import { Button } from "bruv-ui"
import { useRouter } from "next/navigation"

export default function NotFound() {
  const router = useRouter()

  return (
    <div className="flex min-h-dvh w-full items-center justify-center text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-[120px] leading-none font-bold text-bruv-tertiary/20 select-none">
          404
        </h1>
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Page Not Found</h2>
          <p className="text-sm text-bruv-tertiary">
            The page you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>
        <Button variant="secondary" onClick={() => router.back()}>
          Go Back
        </Button>
      </div>
    </div>
  )
}
