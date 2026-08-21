"use client"

import { useSyncExternalStore } from "react"
import { useSettings } from "./use-settings"

const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onStoreChange)
  return () => mql.removeEventListener("change", onStoreChange)
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

// On the server assume no reduced-motion preference; the client snapshot
// corrects it before anything animates.
function getServerSnapshot() {
  return false
}

/**
 * Whether UI animations should run: requires the "Animations" user setting to
 * be on AND the OS to not request reduced motion.
 */
export function useAnimations(): boolean {
  const { data } = useSettings()
  const prefersReducedMotion = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  )
  const enabled = data?.settings?.animations ?? false
  return enabled && !prefersReducedMotion
}
