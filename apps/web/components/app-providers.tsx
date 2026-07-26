"use client"

import { Tooltip, Toaster } from "bruv-ui"
import type { ReactNode } from "react"

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider>
      {children}
      <Toaster />
    </Tooltip.Provider>
  )
}
