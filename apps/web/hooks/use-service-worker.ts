"use client"

import { useEffect, useRef, useCallback } from "react"

export function useServiceWorker() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registrationRef.current = reg
      })
      .catch((err) => {
        console.warn("Service worker registration failed:", err)
      })
  }, [])

  const showNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      const reg = registrationRef.current
      if (reg) {
        reg.showNotification(title, options)
      } else if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        // Fallback to basic Notification API
        try {
          new Notification(title, options)
        } catch {
          // Swallow
        }
      }
    },
    [],
  )

  return { showNotification, registration: registrationRef }
}
