"use client"

import { useEffect, useRef, useCallback } from "react"

export function useServiceWorker() {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return
    }

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registrationRef.current = reg
        console.log("Service worker registered:", reg.scope)
      })
      .catch((err) => {
        console.warn("Service worker registration failed:", err)
      })
  }, [])

  const showNotification = useCallback(
    async (title: string, options?: NotificationOptions) => {
      // Try service worker first
      const reg = registrationRef.current
      if (reg?.active) {
        try {
          await reg.showNotification(title, options)
          return
        } catch (err) {
          console.warn("SW showNotification failed, falling back:", err)
        }
      }

      // Fallback: basic Notification API
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, options)
      }
    },
    []
  )

  return { showNotification }
}
