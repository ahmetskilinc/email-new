import { and, eq, inArray, sql } from "drizzle-orm"
import type { SyncAction, SyncRecord } from "@ahmetskilinc/sync-core"
import { syncAction, syncRecord } from "../db/schema"
import { getSharedDb, type DB } from "../db"

/** A drizzle client or an open transaction — the bridge runs inside either. */
export type DbLike = Pick<DB, "insert" | "select" | "delete" | "execute">

export type SyncPut = {
  model: string
  /** Full record, including the server-stamped userId property. */
  record: SyncRecord
}

export type SyncDelete = { model: string; id: string }

/** JSON deep-equality (jsonb normalizes key order, so stringify can't). */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return false
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false
    return a.every((value, i) => jsonEqual(value, b[i]))
  }
  if (typeof a === "object") {
    const ak = Object.keys(a as object)
    const bk = Object.keys(b as object)
    if (ak.length !== bk.length) return false
    return ak.every((key) =>
      jsonEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    )
  }
  return false
}

/**
 * The single write path from the server to every connected client.
 *
 * Runs INSIDE the caller's transaction (the sync workflow's upsert commit, a
 * mutating server action) so the feeder tables and the sync store can never
 * diverge: it diffs each put against the stored record (skipping no-ops, so
 * repeated backfill pages don't churn the action log), upserts the record
 * rows, allocates global sync IDs, and appends the corresponding actions.
 * Every warm instance's poller then ingests them and fans out over WS —
 * exactly how the engine treats "actions authored by another instance".
 */
export async function publishSyncMutations(
  tx: DbLike,
  userId: string,
  puts: SyncPut[],
  deletes: SyncDelete[] = []
): Promise<number> {
  if (puts.length === 0 && deletes.length === 0) return 0

  // Load current state for diffing, grouped per model to keep the SQL sane.
  const byModel = new Map<string, SyncPut[]>()
  for (const put of puts) {
    let list = byModel.get(put.model)
    if (!list) byModel.set(put.model, (list = []))
    list.push(put)
  }
  const existing = new Map<string, unknown>()
  for (const [model, list] of byModel) {
    const rows = await tx
      .select({ id: syncRecord.id, data: syncRecord.data })
      .from(syncRecord)
      .where(
        and(
          eq(syncRecord.model, model),
          eq(syncRecord.userId, userId),
          inArray(
            syncRecord.id,
            list.map((p) => p.record.id)
          )
        )
      )
    for (const row of rows) existing.set(`${model} ${row.id}`, row.data)
  }

  const changedPuts = puts.filter(
    (put) => !jsonEqual(existing.get(`${put.model} ${put.record.id}`), put.record)
  )

  // Deletes for rows that are already gone are dropped silently.
  const liveDeletes: SyncDelete[] = []
  for (const del of deletes) {
    const rows = await tx
      .select({ id: syncRecord.id })
      .from(syncRecord)
      .where(
        and(
          eq(syncRecord.model, del.model),
          eq(syncRecord.id, del.id),
          eq(syncRecord.userId, userId)
        )
      )
    if (rows.length > 0) liveDeletes.push(del)
  }

  const mutationCount = changedPuts.length + liveDeletes.length
  if (mutationCount === 0) return 0

  const now = new Date()
  if (changedPuts.length > 0) {
    await tx
      .insert(syncRecord)
      .values(
        changedPuts.map((put) => ({
          model: put.model,
          id: put.record.id,
          userId,
          data: put.record as Record<string, unknown>,
          updatedAt: now,
        }))
      )
      .onConflictDoUpdate({
        target: [syncRecord.model, syncRecord.id],
        set: {
          data: sql`excluded.data`,
          updatedAt: now,
        },
        setWhere: eq(syncRecord.userId, userId),
      })
  }
  for (const del of liveDeletes) {
    await tx
      .delete(syncRecord)
      .where(
        and(
          eq(syncRecord.model, del.model),
          eq(syncRecord.id, del.id),
          eq(syncRecord.userId, userId)
        )
      )
  }

  const idRows = (await tx.execute(
    sql`select nextval('zeitmail_sync_id_seq') as id from generate_series(1, ${mutationCount})`
  )) as Array<{ id: string | number }>
  const syncIds = idRows.map((row) => Number(row.id))
  const originTransactionId = crypto.randomUUID()
  const timestamp = Date.now()

  const actions: SyncAction[] = []
  let cursor = 0
  for (const put of changedPuts) {
    const { id: _id, ...data } = put.record
    actions.push({
      syncId: syncIds[cursor++]!,
      // Full-record "update": the client store creates on update-of-missing
      // for non-partial models, and partial models ignore updates for
      // records outside their window — both are exactly what we want. The
      // server's ingest path never re-applies actions to the database.
      mutation: { type: "update", model: put.model, id: put.record.id, data },
      originClientId: "server",
      originTransactionId,
      timestamp,
    })
  }
  for (const del of liveDeletes) {
    actions.push({
      syncId: syncIds[cursor++]!,
      mutation: { type: "delete", model: del.model, id: del.id },
      originClientId: "server",
      originTransactionId,
      timestamp,
    })
  }

  await tx.insert(syncAction).values(
    actions.map((action) => ({
      syncId: action.syncId,
      userId,
      action: action as unknown as Record<string, unknown>,
      createdAt: now,
    }))
  )

  return mutationCount
}

/** Convenience for callers without an open transaction. */
export async function publishSyncMutationsNow(
  userId: string,
  puts: SyncPut[],
  deletes: SyncDelete[] = []
): Promise<number> {
  const { db } = getSharedDb()
  return db.transaction((tx) => publishSyncMutations(tx, userId, puts, deletes))
}
