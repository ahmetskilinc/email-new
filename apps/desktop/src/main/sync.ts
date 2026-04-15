import { BrowserWindow } from "electron"
import { eq } from "drizzle-orm"
import { createDriver } from "@workspace/core/driver"
import type { ManagerConfig } from "@workspace/core/driver/types"
import { getDb } from "./db"
import { connection, user } from "./db/schema"
import { ensureFreshTokens } from "./auth/refresh"

const SYNC_INTERVAL_MS = 60 * 1000

let timer: NodeJS.Timeout | null = null
let running = false

type WindowGetter = () => BrowserWindow | null

function buildDriver(conn: typeof connection.$inferSelect) {
  const config: ManagerConfig = {
    auth: {
      userId: conn.userId,
      accessToken: conn.accessToken ?? "",
      refreshToken: conn.refreshToken ?? "",
      email: conn.email,
    },
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    imapConfig: conn.imapConfig as ManagerConfig["imapConfig"],
  }
  return createDriver(conn.providerId, config)
}

/**
 * Poll each connection's inbox once and notify the renderer when the poll
 * completes. The renderer listens for `mail:synced` via preload and refetches
 * the relevant react-query keys — we keep this main-side work as light as
 * possible (one `list` call per connection) and leave normalization /
 * diffing to the renderer's existing caching layer.
 */
async function syncOnce(getWindow: WindowGetter): Promise<void> {
  if (running) return
  running = true

  try {
    const db = getDb()
    const firstUser = db.select().from(user).limit(1).get()
    if (!firstUser) return

    const conns = db
      .select()
      .from(connection)
      .where(eq(connection.userId, firstUser.id))
      .all()

    const results = await Promise.allSettled(
      conns
        .filter((c) => c.accessToken)
        .map(async (conn) => {
          const fresh = await ensureFreshTokens(conn)
          const driver = buildDriver(fresh)
          const res = await driver.list({ folder: "inbox", maxResults: 25 })
          return {
            connectionId: fresh.id,
            email: fresh.email,
            count: res.threads.length,
          }
        }),
    )

    const synced = results
      .filter(
        (r): r is PromiseFulfilledResult<{ connectionId: string; email: string; count: number }> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value)

    const window = getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send("mail:synced", { connections: synced, at: Date.now() })
    }
  } catch (err) {
    console.error("[sync] sync loop failed:", err)
  } finally {
    running = false
  }
}

export function startBackgroundSync(getWindow: WindowGetter): void {
  if (timer) return
  // Fire once shortly after startup so the user sees fresh mail on launch,
  // then on a fixed interval thereafter.
  setTimeout(() => void syncOnce(getWindow), 5_000)
  timer = setInterval(() => void syncOnce(getWindow), SYNC_INTERVAL_MS)
}

export function stopBackgroundSync(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
