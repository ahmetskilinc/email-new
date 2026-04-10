"use client"

import { useEffect, useRef, useCallback } from "react"

export function useServiceWorker() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const readyPromiseRef = useRef<Promise<ServiceWorkerRegistration> | null>(
    null,
  )

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return
    }

    // Register and wait for the SW to be active
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registrationRef.current = reg
      })
      .catch((err) => {
        console.warn("Service worker registration failed:", err)
      })

    // Store the ready promise so showNotification can await it
    readyPromiseRef.current = navigator.serviceWorker.ready
    navigator.serviceWorker.ready.then((reg) => {
      registrationRef.current = reg
    })
  }, [])

  const showNotification = useCallback(
    async (title: string, options?: NotificationOptions) => {
      try {
        // Try to get the active SW registration
        let reg = registrationRef.current
        if (!reg && readyPromiseRef.current) {
          reg = await readyPromiseRef.current
        }

        if (reg) {
          await reg.showNotification(title, options)
          return
        }
      } catch {
        // Fall through to basic API
      }

      // Fallback to basic Notification API
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification(title, options)
        } catch {
          // Swallow
        }
      }
    },
    [],
  )

  return { showNotification }
}
