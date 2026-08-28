"use client"

import { useCallback } from "react"
import {
  SyncProvider as EngineSyncProvider,
  useSyncBinding,
} from "@ahmetskilinc/sync-react"
import {
  IndexedDBPersistence,
  SyncClient,
  WebSocketTransport,
} from "@ahmetskilinc/sync-client"
import { syncSchema, ThreadPreview } from "@workspace/core/sync"
import { useSessionSnapshot } from "@/providers/session-provider"

/**
 * Rollout flag for the local-first data path. Build-time constant: the
 * NEXT_PUBLIC_ prefix inlines it, so the hook seams that fork on it are
 * stable for the lifetime of a build.
 */
export const SYNC_ENGINE_ENABLED = process.env.NEXT_PUBLIC_SYNC_ENGINE === "1"

/**
 * localhost dev → the standalone Bun sync server (`bun run sync-server`),
 * because `next dev` cannot upgrade WebSockets; deployed → the same-origin
 * /api/sync route on Vercel Functions. NEXT_PUBLIC_SYNC_URL overrides both.
 */
function getSyncUrl(): string {
  if (process.env.NEXT_PUBLIC_SYNC_URL) return process.env.NEXT_PUBLIC_SYNC_URL
  // Client construction can happen during a server render pass (hooks read
  // the client for snapshots); the socket only ever opens in the browser, so
  // a placeholder URL is fine outside it.
  if (typeof window === "undefined") return "ws://localhost/api/sync"
  const { protocol, host, hostname } = window.location
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "ws://localhost:3001"
  }
  return `${protocol === "https:" ? "wss" : "ws"}://${host}/api/sync`
}

function createMailSyncClient(uid: string): SyncClient {
  const client = new SyncClient({
    schema: syncSchema,
    transport: new WebSocketTransport(getSyncUrl(), { reconnectDelayMs: 500 }),
    // Three-layer multi-user protection: per-user database name, the scope
    // fingerprint (mismatch purges on load), and clear() on sign-out.
    persistence: new IndexedDBPersistence(`zeitmail-sync:${uid}`),
    scope: uid,
  })
  // The inbox list: per-connection groups plus one merged all-inboxes group,
  // both newest-first. Maintained incrementally — no per-render re-sorts.
  client.store.defineIndex(ThreadPreview, {
    name: "inbox",
    key: (record) =>
      record.labels.includes("INBOX") && !record.labels.includes("TRASH")
        ? record.connectionId
        : null,
    compare: (a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt),
  })
  client.store.defineIndex(ThreadPreview, {
    name: "inboxAll",
    key: (record) =>
      record.labels.includes("INBOX") && !record.labels.includes("TRASH")
        ? "all"
        : null,
    compare: (a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt),
  })
  return client
}

/**
 * Mounts the sync engine for the signed-in user. Keyed by uid: an account
 * switch tears the old client down (provider unmount stops it) and builds a
 * fresh one against the new user's database.
 */
export function MailSyncProvider({ children }: { children: React.ReactNode }) {
  const { uid } = useSessionSnapshot()
  if (!SYNC_ENGINE_ENABLED) return children
  return (
    <EngineSyncProvider
      key={uid}
      createClient={() => createMailSyncClient(uid)}
    >
      {children}
    </EngineSyncProvider>
  )
}

function useSyncLogoutPurgeReal(): () => Promise<void> {
  const binding = useSyncBinding()
  return useCallback(async () => {
    try {
      await binding.ensure().clear()
    } catch {
      // best-effort: sign-out must proceed regardless
    }
  }, [binding])
}

const noopPurge = () => Promise.resolve()
function useSyncLogoutPurgeDisabled(): () => Promise<void> {
  return noopPurge
}

/** Purges the local sync store on sign-out (device hygiene, like the query cache). */
export const useSyncLogoutPurge = SYNC_ENGINE_ENABLED
  ? useSyncLogoutPurgeReal
  : useSyncLogoutPurgeDisabled
