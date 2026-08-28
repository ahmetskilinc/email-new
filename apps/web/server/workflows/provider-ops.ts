import { sleep } from "workflow"
import { and, eq, sql } from "drizzle-orm"
import { getSharedDb } from "../db"
import { connection as connectionTable } from "../db/schema"
import { connectionToDriver } from "../lib/server-utils"
import { ensureFreshAccessToken } from "../lib/token-store"
import { publishSyncMutationsNow } from "../sync/bridge"
import { MailOp, type MailOpRecord } from "@workspace/core/sync"
import { syncConnection } from "./sync-connection"

/**
 * The durable side-effect worker behind client mutations.
 *
 * User actions are DATA: a client transact pairs its optimistic
 * ThreadPreview patch with a MailOp record. This workflow claims pending
 * ops (atomically — concurrent runs cannot double-claim), performs the real
 * provider call, and publishes done/failed back through the bridge. After a
 * terminal failure it triggers a one-shot provider sync, which republishes
 * provider truth for the affected threads — every client's optimistic state
 * converges back without bespoke rollback plumbing.
 */

const MAX_ATTEMPTS = 3
const CLAIM_BATCH = 10
const MAX_ROUNDS = 50
/** A 'processing' op whose claim is older than this is fair game again. */
const STALE_CLAIM_MS = 10 * 60 * 1000
const DONE_RETENTION_MS = 24 * 60 * 60 * 1000

type OpResult = { ok: true } | { ok: false; error: string }

/**
 * Atomically claim up to CLAIM_BATCH ops: pending ones, plus 'processing'
 * ones whose claim went stale (a crashed run). jsonb status flip with a
 * WHERE guard makes the claim exclusive under concurrency.
 */
async function claimPendingOpsStep(
  connectionId: string,
  userId: string
): Promise<MailOpRecord[]> {
  "use step"
  const { db } = getSharedDb()
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString()
  const claimedAt = new Date().toISOString()
  const rows = (await db.execute(sql`
    update zeitmail_sync_record
    set data = jsonb_set(
      jsonb_set(data, '{status}', '"processing"'),
      '{claimedAt}', to_jsonb(${claimedAt}::text)
    )
    where ctid in (
      select ctid from zeitmail_sync_record
      where model = ${MailOp.name}
        and user_id = ${userId}
        and data->>'connectionId' = ${connectionId}
        and (
          data->>'status' = 'pending'
          or (data->>'status' = 'processing'
              and coalesce(data->>'claimedAt', '') < ${staleBefore})
        )
      order by data->>'createdAt'
      limit ${CLAIM_BATCH}
    )
    returning data
  `)) as Array<{ data: MailOpRecord }>

  // Opportunistic retention: drop old done ops (and tell clients).
  const cutoff = new Date(Date.now() - DONE_RETENTION_MS).toISOString()
  const stale = (await db.execute(sql`
    select id from zeitmail_sync_record
    where model = ${MailOp.name}
      and user_id = ${userId}
      and data->>'status' = 'done'
      and data->>'createdAt' < ${cutoff}
    limit 100
  `)) as Array<{ id: string }>
  if (stale.length > 0) {
    await publishSyncMutationsNow(
      userId,
      [],
      stale.map((row) => ({ model: MailOp.name, id: row.id }))
    ).catch(() => undefined)
  }

  return rows.map((row) => row.data)
}

async function executeOpStep(
  connectionId: string,
  userId: string,
  op: MailOpRecord
): Promise<OpResult> {
  "use step"
  const { db } = getSharedDb()
  const conn = await db.query.connection.findFirst({
    where: and(
      eq(connectionTable.id, connectionId),
      eq(connectionTable.userId, userId)
    ),
  })
  if (!conn) return { ok: false, error: "Connection not found" }

  try {
    const fresh = await ensureFreshAccessToken(conn)
    const driver = connectionToDriver(fresh)
    const ids = op.threadIds
    switch (op.op) {
      case "markRead":
        await driver.markAsRead(ids)
        break
      case "markUnread":
        await driver.markAsUnread(ids)
        break
      case "archive":
        await driver.modifyLabels(ids, { addLabels: [], removeLabels: ["INBOX"] })
        break
      case "delete":
        await driver.modifyLabels(ids, { addLabels: ["TRASH"], removeLabels: [] })
        break
      case "star":
        await driver.modifyLabels(ids, { addLabels: ["STARRED"], removeLabels: [] })
        break
      case "unstar":
        await driver.modifyLabels(ids, { addLabels: [], removeLabels: ["STARRED"] })
        break
      case "modifyLabels":
        await driver.modifyLabels(ids, {
          addLabels: op.addLabels ?? [],
          removeLabels: op.removeLabels ?? [],
        })
        break
      default:
        return { ok: false, error: `Unknown op "${op.op as string}"` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error as Error)?.message ?? String(error) }
  }
}

async function finalizeOpStep(
  connectionId: string,
  userId: string,
  op: MailOpRecord,
  result: OpResult
): Promise<{ terminalFailure: boolean; retried: boolean }> {
  "use step"
  const attempts = (op.attempts ?? 0) + 1
  if (result.ok) {
    await publishSyncMutationsNow(userId, [
      {
        model: MailOp.name,
        record: { ...op, status: "done", attempts, error: null },
      },
    ])
    return { terminalFailure: false, retried: false }
  }
  if (attempts < MAX_ATTEMPTS) {
    await publishSyncMutationsNow(userId, [
      {
        model: MailOp.name,
        record: { ...op, status: "pending", attempts, error: result.error },
      },
    ])
    return { terminalFailure: false, retried: true }
  }
  await publishSyncMutationsNow(userId, [
    {
      model: MailOp.name,
      record: { ...op, status: "failed", attempts, error: result.error },
    },
  ])
  return { terminalFailure: true, retried: false }
}

/** After a terminal failure, republish provider truth so clients converge. */
async function reconcileStep(connectionId: string, userId: string) {
  "use step"
  const { startWorkflowSafe } = await import("../sync/workflow-start")
  await startWorkflowSafe(
    syncConnection as (input: never) => Promise<unknown>,
    { connectionId, userId },
    () => syncConnection({ connectionId, userId })
  )
}

export async function processProviderOps({
  connectionId,
  userId,
}: {
  connectionId: string
  userId: string
}) {
  "use workflow"
  let anyTerminalFailure = false
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const ops = await claimPendingOpsStep(connectionId, userId)
    if (ops.length === 0) break
    let anyRetried = false
    for (const op of ops) {
      const result = await executeOpStep(connectionId, userId, op)
      const outcome = await finalizeOpStep(connectionId, userId, op, result)
      anyTerminalFailure ||= outcome.terminalFailure
      anyRetried ||= outcome.retried
    }
    // Back off between rounds when something failed, so a flaky provider
    // isn't hammered by the retry loop. (Durable sleep in the workflow
    // runtime; a plain timer in the dev inline run.)
    if (anyRetried) {
      try {
        await sleep("30s")
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 5_000))
      }
    }
  }
  if (anyTerminalFailure) {
    await reconcileStep(connectionId, userId)
  }
  return { connectionId, status: "drained" as const }
}

/** Fire-and-forget: wake the worker for a connection. Idempotent. */
export async function kickProviderOps(
  connectionId: string,
  userId: string
): Promise<void> {
  const { startWorkflowSafe } = await import("../sync/workflow-start")
  await startWorkflowSafe(
    processProviderOps as (input: never) => Promise<unknown>,
    { connectionId, userId },
    // Dev standalone: no workflow runtime — drain inline, undurably.
    () => processProviderOps({ connectionId, userId })
  )
}
