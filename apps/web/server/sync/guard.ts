import {
  createConnectionGuard,
  getHeader,
  type UpgradeRequestLike,
} from "@ahmetskilinc/sync-server"
import { auth } from "../lib/auth"

export type SyncContext = { userId: string }

const extraOrigins = (process.env.SYNC_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

/**
 * WebSocket admission: mandatory Origin check (browsers do not apply the
 * same-origin policy to WebSocket upgrades — without this, any page could
 * open a cookie-authenticated socket) + the exact same better-auth cookie
 * validation the server actions use. No token ever reaches client storage;
 * the HttpOnly session cookie rides the upgrade request.
 */
export const syncGuard = createConnectionGuard<SyncContext>({
  origin: (origin: string | null, request: UpgradeRequestLike) => {
    if (!origin) return false
    if (extraOrigins.includes(origin)) return true
    const host = getHeader(request, "host")
    if (!host) return false
    try {
      const parsed = new URL(origin)
      if (parsed.host === host) return true
      // Dev only: the standalone sync server runs on :3001 while the app
      // serves from :3000, so same-origin can never match locally.
      return (
        process.env.NODE_ENV !== "production" &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
      )
    } catch {
      return false
    }
  },
  authenticate: async (request) => {
    // On Vercel/Next the upgrade request is a Web Request with real Headers.
    const headers = (request as Request).headers
    if (!headers || typeof headers.get !== "function") return null
    const session = await auth.api.getSession({ headers: headers as Headers })
    return session?.user ? { userId: session.user.id } : null
  },
  onReject: ({ reason }) => {
    console.warn(`[sync] connection refused: ${reason}`)
  },
})
