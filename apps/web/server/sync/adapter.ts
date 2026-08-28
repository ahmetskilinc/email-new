import { and, asc, eq, gt, ne, sql } from "drizzle-orm"
import type { DatabaseAdapter, DatabaseWrite } from "@ahmetskilinc/sync-server"
import type { SyncAction, SyncRecord } from "@ahmetskilinc/sync-core"
import { syncAction, syncMeta, syncRecord } from "../db/schema"
import { getSharedDb } from "../db"
import { Message } from "@workspace/core/sync"

/**
 * Sync-engine storage over the shared Postgres pool, scoped to ONE user
 * partition: every query carries the userId predicate, so `getAll()` — the
 * bootstrap read — is one indexed per-tenant scan, never a table scan across
 * users. Constructed per partition by the PartitionRegistry.
 */
export class DrizzleSyncDatabase implements DatabaseAdapter {
  constructor(private readonly userId: string) {}

  async get(model: string, id: string): Promise<SyncRecord | undefined> {
    const { db } = getSharedDb()
    const row = await db.query.syncRecord.findFirst({
      where: and(
        eq(syncRecord.model, model),
        eq(syncRecord.id, id),
        eq(syncRecord.userId, this.userId)
      ),
    })
    return row ? (row.data as SyncRecord) : undefined
  }

  async put(model: string, record: SyncRecord): Promise<void> {
    const { db } = getSharedDb()
    await db
      .insert(syncRecord)
      .values({
        model,
        id: record.id,
        userId: this.userId,
        data: record as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [syncRecord.model, syncRecord.id],
        set: { data: record as Record<string, unknown>, updatedAt: new Date() },
        // Cross-partition id collisions cannot happen (ids embed the
        // connection id), but never let one partition overwrite another.
        setWhere: eq(syncRecord.userId, this.userId),
      })
  }

  async delete(model: string, id: string): Promise<void> {
    const { db } = getSharedDb()
    await db
      .delete(syncRecord)
      .where(
        and(
          eq(syncRecord.model, model),
          eq(syncRecord.id, id),
          eq(syncRecord.userId, this.userId)
        )
      )
  }

  /** The bootstrap read: this partition's records, minus pull-only models. */
  async getAll(): Promise<Record<string, SyncRecord[]>> {
    const { db } = getSharedDb()
    const rows = await db
      .select({ model: syncRecord.model, data: syncRecord.data })
      .from(syncRecord)
      .where(
        and(
          eq(syncRecord.userId, this.userId),
          // Messages are pull-only (Phase F): never in the bootstrap stream.
          ne(syncRecord.model, Message.name)
        )
      )
    const out: Record<string, SyncRecord[]> = {}
    for (const row of rows) {
      ;(out[row.model] ??= []).push(row.data as SyncRecord)
    }
    return out
  }

  /** Atomic multi-write — the engine prefers this over sequential writes. */
  async applyBatch(writes: DatabaseWrite[]): Promise<void> {
    const { db } = getSharedDb()
    await db.transaction(async (tx) => {
      for (const write of writes) {
        if (write.type === "put") {
          await tx
            .insert(syncRecord)
            .values({
              model: write.model,
              id: write.record.id,
              userId: this.userId,
              data: write.record as Record<string, unknown>,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [syncRecord.model, syncRecord.id],
              set: {
                data: write.record as Record<string, unknown>,
                updatedAt: new Date(),
              },
              setWhere: eq(syncRecord.userId, this.userId),
            })
        } else {
          await tx
            .delete(syncRecord)
            .where(
              and(
                eq(syncRecord.model, write.model),
                eq(syncRecord.id, write.id),
                eq(syncRecord.userId, this.userId)
              )
            )
        }
      }
    })
  }
}

// ---------------------------------------------------------------------------
// Distributed-mode plumbing (shared across all partitions)
// ---------------------------------------------------------------------------

export async function allocateSyncId(): Promise<number> {
  const { db } = getSharedDb()
  const rows = (await db.execute(
    sql`select nextval('zeitmail_sync_id_seq') as id`
  )) as Array<{ id: string | number }>
  return Number(rows[0]!.id)
}

export async function allocateSyncIds(count: number): Promise<number[]> {
  const { db } = getSharedDb()
  const rows = (await db.execute(
    sql`select nextval('zeitmail_sync_id_seq') as id from generate_series(1, ${count})`
  )) as Array<{ id: string | number }>
  return rows.map((row) => Number(row.id))
}

/** Durably append one partition's confirmed actions to the global log. */
export async function persistActions(
  userId: string,
  actions: SyncAction[]
): Promise<void> {
  if (actions.length === 0) return
  const { db } = getSharedDb()
  await db
    .insert(syncAction)
    .values(
      actions.map((action) => ({
        syncId: action.syncId,
        userId,
        action: action as unknown as Record<string, unknown>,
        createdAt: new Date(),
      }))
    )
    .onConflictDoNothing({ target: syncAction.syncId })
}

/** Global poller read: everything after `since`, across all partitions. */
export async function fetchActionsSinceGlobal(
  since: number,
  limit: number
): Promise<Array<{ userId: string; action: SyncAction }>> {
  const { db } = getSharedDb()
  const rows = await db
    .select({ userId: syncAction.userId, action: syncAction.action })
    .from(syncAction)
    .where(gt(syncAction.syncId, since))
    .orderBy(asc(syncAction.syncId))
    .limit(limit)
  return rows.map((row) => ({
    userId: row.userId,
    action: row.action as unknown as SyncAction,
  }))
}

/** One partition's actions after `since` — the durable catch-up fallback. */
export async function fetchUserActionsSince(
  userId: string,
  since: number,
  limit: number
): Promise<SyncAction[]> {
  const { db } = getSharedDb()
  const rows = await db
    .select({ action: syncAction.action })
    .from(syncAction)
    .where(and(eq(syncAction.userId, userId), gt(syncAction.syncId, since)))
    .orderBy(asc(syncAction.syncId))
    .limit(limit)
  return rows.map((row) => row.action as unknown as SyncAction)
}

/** Seed a freshly created partition's in-memory log with its recent tail. */
export async function fetchRecentActionsFor(
  userId: string,
  limit: number
): Promise<SyncAction[]> {
  const { db } = getSharedDb()
  const rows = await db
    .select({ action: syncAction.action })
    .from(syncAction)
    .where(eq(syncAction.userId, userId))
    .orderBy(sql`${syncAction.syncId} desc`)
    .limit(limit)
  return rows
    .map((row) => row.action as unknown as SyncAction)
    .sort((a, b) => a.syncId - b.syncId)
}

/** The current global high-water mark, for initializing the poller cursor. */
export async function fetchMaxSyncId(): Promise<number> {
  const { db } = getSharedDb()
  const rows = (await db.execute(
    sql`select coalesce(max(sync_id), 0) as max from zeitmail_sync_action`
  )) as Array<{ max: string | number }>
  return Number(rows[0]!.max)
}

const GLOBAL_EPOCH_KEY = "epoch"

async function getMeta(key: string): Promise<string | null> {
  const { db } = getSharedDb()
  const row = await db.query.syncMeta.findFirst({ where: eq(syncMeta.key, key) })
  return row?.value ?? null
}

async function ensureMeta(key: string, initial: string): Promise<string> {
  const { db } = getSharedDb()
  await db
    .insert(syncMeta)
    .values({ key, value: initial })
    .onConflictDoNothing({ target: syncMeta.key })
  return (await getMeta(key)) ?? initial
}

/**
 * Per-partition epoch: `${globalEpoch}:${partitionGeneration}`. Stable across
 * deploys and instances (mandatory in distributed mode); bumping one user's
 * generation forces only their clients to re-bootstrap.
 */
export async function getPartitionEpoch(userId: string): Promise<string> {
  const globalEpoch = await ensureMeta(GLOBAL_EPOCH_KEY, crypto.randomUUID())
  const generation = (await getMeta(`partition-gen:${userId}`)) ?? "0"
  return `${globalEpoch}:${generation}`
}

/** Wipe-and-resync escape hatch for one user's partition. */
export async function bumpPartitionGeneration(userId: string): Promise<void> {
  const { db } = getSharedDb()
  const key = `partition-gen:${userId}`
  const current = Number((await getMeta(key)) ?? "0")
  await db
    .insert(syncMeta)
    .values({ key, value: String(current + 1) })
    .onConflictDoUpdate({
      target: syncMeta.key,
      set: { value: String(current + 1) },
    })
}
