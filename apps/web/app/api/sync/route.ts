import { experimental_upgradeWebSocket } from "@vercel/functions"
import {
  decodeMessage,
  encodeMessage,
  type ClientMessage,
  type ServerMessage,
} from "@ahmetskilinc/sync-core"
import type { ServerConnection } from "@ahmetskilinc/sync-server"
import { getSyncRegistry } from "@/server/sync/server-instance"
import { ensureSchedulersForUser, primeUserSyncRecords } from "@/server/sync/prime"
import { syncGuard } from "@/server/sync/guard"

export const maxDuration = 300

const MAX_MESSAGE_BYTES = 256 * 1024

/**
 * The sync WebSocket. Excluded from proxy.ts's matcher (an upgrade is not a
 * document); admission control lives in syncGuard — Origin check + the same
 * better-auth cookie validation every server action performs.
 */
export async function GET(request: Request) {
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("This endpoint speaks WebSocket only", { status: 426 })
  }

  // Authorize before upgrading — a refused client never gets a socket at all.
  const auth = await syncGuard(request)
  if (!auth.ok) {
    return new Response(auth.reason, { status: auth.status })
  }
  const { userId } = auth.context

  const registry = await getSyncRegistry()
  const server = await registry.serverFor(userId)

  // Fire-and-forget upkeep: refresh the shell models and make sure the
  // provider sync loops are running. Neither gates the socket.
  primeUserSyncRecords(userId).catch((error) =>
    console.error("[sync] prime failed:", error)
  )
  ensureSchedulersForUser(userId).catch((error) =>
    console.error("[sync] scheduler kick failed:", error)
  )

  return experimental_upgradeWebSocket((ws) => {
    const connection: ServerConnection = {
      send(message: ServerMessage) {
        try {
          ws.send(encodeMessage(message))
        } catch {
          // a failing socket must not abort the server's fan-out loop
        }
      },
      onMessage(handler: (message: ClientMessage) => void) {
        ws.on("message", (data: unknown) => {
          const raw = String(data)
          if (raw.length > MAX_MESSAGE_BYTES) {
            ws.close(1009, "Message exceeds size limit")
            return
          }
          try {
            handler(decodeMessage<ClientMessage>(raw))
          } catch {
            // ignore malformed frames
          }
        })
      },
      onClose(handler: () => void) {
        ws.on("close", handler)
      },
      close() {
        try {
          ws.close(1001, "Server closing")
        } catch {
          // already gone
        }
      },
    }
    server.handleConnection(connection, auth.context)
  })
}
