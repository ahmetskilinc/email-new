import { PartitionRegistry, SyncServer } from "@ahmetskilinc/sync-server"
import type { SyncAction } from "@ahmetskilinc/sync-core"
import { BOOTSTRAP_ORDER, MailOp, syncSchema } from "@workspace/core/sync"
import {
  DrizzleSyncDatabase,
  allocateSyncId,
  allocateSyncIds,
  fetchActionsSinceGlobal,
  fetchMaxSyncId,
  fetchRecentActionsFor,
  fetchUserActionsSince,
  getPartitionEpoch,
  persistActions,
} from "./adapter"
import { makeValidateTransaction } from "./validate"

const POLL_INTERVAL_MS = 1_000
const POLL_BATCH = 1_000
const PARTITION_LOG_SIZE = 2_000
const PARTITION_IDLE_MS = 5 * 60 * 1000

/**
 * One PartitionRegistry per warm serverless instance: a SyncServer per
 * connected user, each over a partition-scoped adapter (bootstrap reads one
 * tenant, no cross-tenant filtering anywhere), all sharing the global
 * Postgres sequence + action log. One poller per instance follows the global
 * log with a single cursor and demuxes into resident partitions; its cadence
 * bounds cross-instance delta latency (swap for LISTEN/NOTIFY if 1s ever
 * matters). The poller lives exactly as long as the instance has sockets —
 * maxDuration bounds each socket, and reconnect+catch-up hides the cycle.
 */
let registryPromise: Promise<PartitionRegistry> | null = null

export function getSyncRegistry(): Promise<PartitionRegistry> {
  if (registryPromise) return registryPromise
  registryPromise = (async () => {
    const registry = new PartitionRegistry({
      idleTimeoutMs: PARTITION_IDLE_MS,
      onError: (error, context) =>
        console.error(`[sync registry ${context}]`, error),
      createServer: async (userId) =>
        new SyncServer({
          schema: syncSchema,
          database: new DrizzleSyncDatabase(userId),
          requireContext: true,
          syncLogSize: PARTITION_LOG_SIZE,
          epoch: await getPartitionEpoch(userId),
          bootstrap: { order: [...BOOTSTRAP_ORDER], chunkRecords: 200 },
          validateTransaction: makeValidateTransaction(userId),
          onError: (error, context) =>
            console.error(`[sync ${userId.slice(0, 8)} ${context}]`, error),
          distributed: {
            allocateSyncId,
            allocateSyncIds,
            persistActions: (actions) => persistActions(userId, actions),
            initialActions: await fetchRecentActionsFor(userId, 1_000),
            fetchActionsSince: (since, limit) =>
              fetchUserActionsSince(userId, since, limit),
          },
        }),
    })

    let cursor = await fetchMaxSyncId()
    const poll = async () => {
      try {
        const rows = await fetchActionsSinceGlobal(cursor, POLL_BATCH)
        if (rows.length === 0) return
        cursor = rows[rows.length - 1]!.action.syncId
        const byUser = new Map<string, SyncAction[]>()
        for (const row of rows) {
          let list = byUser.get(row.userId)
          if (!list) byUser.set(row.userId, (list = []))
          list.push(row.action)
        }
        for (const [userId, actions] of byUser) {
          registry.ingest(userId, actions)
          kickProviderOpsIfNeeded(userId, actions)
        }
      } catch (error) {
        console.error("[sync poll]", error)
      }
    }
    setInterval(poll, POLL_INTERVAL_MS)

    return registry
  })()
  // A rejected promise cached here would turn one transient Postgres blip
  // into permanent failures for the process lifetime.
  registryPromise.catch(() => {
    registryPromise = null
  })
  return registryPromise
}

/**
 * A client-authored pending MailOp just landed in the log: wake the durable
 * provider-ops worker so the real driver call happens promptly instead of on
 * the next scheduled cycle. Fire-and-forget; the workflow is idempotent.
 */
function kickProviderOpsIfNeeded(userId: string, actions: SyncAction[]): void {
  const connectionIds = new Set<string>()
  for (const action of actions) {
    if (action.originClientId === "server") continue
    if (action.mutation.type !== "create") continue
    if (action.mutation.model !== MailOp.name) continue
    const connectionId = action.mutation.data.connectionId
    if (typeof connectionId === "string") connectionIds.add(connectionId)
  }
  if (connectionIds.size === 0) return
  void import("../workflows/provider-ops")
    .then(({ kickProviderOps }) =>
      Promise.all(
        [...connectionIds].map((connectionId) =>
          kickProviderOps(connectionId, userId)
        )
      )
    )
    .catch((error) => console.error("[sync] provider-ops kick failed:", error))
}
