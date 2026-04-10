/// <reference lib="webworker" />

// Service worker for desktop notifications
// Handles push events and notification clicks

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title ?? "New email"
  const options = {
    body: data.body ?? "",
    tag: data.tag ?? "mail-notification",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      url: data.url ?? "/mail/inbox",
    },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? "/mail/inbox"

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Focus existing tab if open
        for (const client of clients) {
          if (client.url.includes("/mail") && "focus" in client) {
            return client.focus()
          }
        }
        // Otherwise open a new tab
        return self.clients.openWindow(url)
      }),
  )
})

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})
