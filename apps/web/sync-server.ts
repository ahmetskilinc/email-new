/**
 * Standalone sync WebSocket server for local development.
 *
 * `next dev` cannot upgrade WebSockets, so locally the client connects to
 * this Bun process (port 3001) instead of /api/sync — same guard, same
 * partition registry, same Postgres. Deployed, the /api/sync route on
 * Vercel Functions serves the identical protocol and this file is unused.
 *
 *   bun run sync-server
 */
import {
  decodeMessage,
  encodeMessage,
  type ClientMessage,
  type ServerMessage,
} from "@ahmetskilinc/sync-core"
import type { ServerConnection } from "@ahmetskilinc/sync-server"
import { getSyncRegistry } from "./server/sync/server-instance"
import { ensureSchedulersForUser, primeUserSyncRecords } from "./server/sync/prime"
import { syncGuard, type SyncContext } from "./server/sync/guard"

const PORT = Number(process.env.SYNC_PORT ?? 3001)
const MAX_MESSAGE_BYTES = 256 * 1024

type SocketData = {
  context: SyncContext
  onMessage: ((message: ClientMessage) => void) | null
  onClose: (() => void) | null
  /** Frames that arrived while the async open() was still wiring up. */
  pending: string[]
  closed: boolean
}

type SyncSocket = {
  data: SocketData
  send(payload: string): void
  close(code?: number, reason?: string): void
}

// Minimal structural typing for the Bun runtime this entrypoint runs under —
// the app's tsconfig deliberately doesn't load bun-types (it targets DOM+node).
declare const Bun: {
  serve(options: {
    port: number
    fetch(
      request: Request,
      server: {
        upgrade(request: Request, init: { data: SocketData }): boolean
      }
    ): Promise<Response | undefined> | Response | undefined
    websocket: {
      open(ws: SyncSocket): void | Promise<void>
      message(ws: SyncSocket, data: unknown): void
      close(ws: SyncSocket): void
    }
  }): { port: number }
}

const server = Bun.serve({
  port: PORT,
  async fetch(request, bunServer) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("This endpoint speaks WebSocket only", { status: 426 })
    }
    const auth = await syncGuard(request)
    if (!auth.ok) {
      return new Response(auth.reason, { status: auth.status })
    }
    const upgraded = bunServer.upgrade(request, {
      data: {
        context: auth.context,
        onMessage: null,
        onClose: null,
        pending: [],
        closed: false,
      },
    })
    if (!upgraded) return new Response("Upgrade failed", { status: 400 })
    return undefined
  },
  websocket: {
    async open(ws: SyncSocket) {
      const { userId } = ws.data.context
      const registry = await getSyncRegistry()
      const syncServer = await registry.serverFor(userId)

      primeUserSyncRecords(userId).catch((error) =>
        console.error("[sync] prime failed:", error)
      )
      ensureSchedulersForUser(userId).catch((error) =>
        console.error("[sync] scheduler kick failed:", error)
      )

      const connection: ServerConnection = {
        send(message: ServerMessage) {
          try {
            ws.send(encodeMessage(message))
          } catch {
            // a failing socket must not abort the fan-out loop
          }
        },
        onMessage(handler) {
          ws.data.onMessage = handler
        },
        onClose(handler) {
          ws.data.onClose = handler
        },
        close() {
          try {
            ws.close(1001, "Server closing")
          } catch {
            // already gone
          }
        },
      }
      syncServer.handleConnection(connection, ws.data.context)
      // open() awaited the registry above, and Bun delivers frames as they
      // arrive — anything that beat us here (typically the hello) was
      // buffered by the message handler. Drain in order.
      for (const raw of ws.data.pending.splice(0)) {
        try {
          ws.data.onMessage?.(decodeMessage<ClientMessage>(raw))
        } catch {
          // ignore malformed frames
        }
      }
      if (ws.data.closed) ws.data.onClose?.()
    },
    message(ws: SyncSocket, data: unknown) {
      const raw = String(data)
      if (raw.length > MAX_MESSAGE_BYTES) {
        ws.close(1009, "Message exceeds size limit")
        return
      }
      if (!ws.data.onMessage) {
        ws.data.pending.push(raw)
        return
      }
      try {
        ws.data.onMessage(decodeMessage<ClientMessage>(raw))
      } catch {
        // ignore malformed frames
      }
    },
    close(ws: SyncSocket) {
      ws.data.closed = true
      ws.data.onClose?.()
    },
  },
})

console.log(`[sync-server] listening on ws://localhost:${server.port}`)
