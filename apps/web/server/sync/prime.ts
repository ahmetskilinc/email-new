import { eq } from "drizzle-orm"
import {
  Connection,
  Label,
  Message,
  Settings,
  ThreadPreview,
  UserProfile,
} from "@workspace/core/sync"
import { connection, user, userSettings } from "../db/schema"
import { getSharedDb } from "../db"
import { publishSyncMutationsNow, type SyncDelete, type SyncPut } from "./bridge"

const APP_PASSWORD_PROVIDERS = new Set(["icloud", "yahoo", "custom"])

function connectionStatus(row: typeof connection.$inferSelect): string {
  const tokensDead =
    !row.accessToken ||
    (!APP_PASSWORD_PROVIDERS.has(row.providerId) && !row.refreshToken)
  return row.status === "reauth_required" || tokensDead
    ? "reauth_required"
    : "active"
}

/**
 * Publishes the shell models — sanitized connections, settings, and the user
 * profile — from Postgres into the sync store. No provider calls, cheap, and
 * diffed by the bridge, so calling it on every WS connect and after every
 * mutating account action costs nothing when nothing changed.
 */
export async function primeUserSyncRecords(userId: string): Promise<void> {
  const { db } = getSharedDb()
  const [userRow, settingsRow, connections] = await Promise.all([
    db.query.user.findFirst({ where: eq(user.id, userId) }),
    db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) }),
    db.query.connection.findMany({ where: eq(connection.userId, userId) }),
  ])
  if (!userRow) return

  const puts: SyncPut[] = [
    {
      model: UserProfile.name,
      record: {
        id: userId,
        userId,
        email: userRow.email,
        name: userRow.name ?? null,
        image: userRow.image ?? null,
        defaultConnectionId: userRow.defaultConnectionId ?? null,
      },
    },
    ...(settingsRow
      ? [
          {
            model: Settings.name,
            record: {
              id: userId,
              userId,
              settings: settingsRow.settings as Record<string, unknown>,
            },
          },
        ]
      : []),
    ...connections.map((row) => ({
      model: Connection.name,
      record: {
        id: row.id,
        userId,
        email: row.email,
        name: row.name ?? null,
        picture: row.picture ?? null,
        providerId: row.providerId,
        createdAt: row.createdAt.toISOString(),
        status: connectionStatus(row),
      },
    })),
  ]

  await publishSyncMutationsNow(userId, puts)
}

/**
 * A connection was deleted: remove every sync record hanging off it, so all
 * clients converge on the removal. Thread/label/message records are found by
 * their `${connectionId}:` id prefix.
 */
export async function removeConnectionSyncRecords(
  userId: string,
  connectionId: string
): Promise<void> {
  const { db } = getSharedDb()
  const { syncRecord } = await import("../db/schema")
  const rows = await db
    .select({ model: syncRecord.model, id: syncRecord.id })
    .from(syncRecord)
    .where(eq(syncRecord.userId, userId))
  const prefix = `${connectionId}:`
  const deletes: SyncDelete[] = rows
    .filter(
      (row) =>
        row.id === connectionId ||
        (row.id.startsWith(prefix) &&
          [ThreadPreview.name, Message.name, Label.name].includes(row.model)) ||
        (row.model === "ConnectionSyncStatus" && row.id === connectionId)
    )
    .map((row) => ({ model: row.model, id: row.id }))
  if (deletes.length > 0) {
    await publishSyncMutationsNow(userId, [], deletes)
  }
  // The shell models change too (one fewer connection).
  await primeUserSyncRecords(userId)
}

/**
 * Idempotently (re)starts the durable sync scheduler for every connection of
 * a user — called fire-and-forget from WS connects and sign-ins. Ownership
 * lives in syncState (schedulerRunId + heartbeat), so duplicate starts exit
 * immediately while the live loop keeps running.
 */
export async function ensureSchedulersForUser(userId: string): Promise<void> {
  const { db } = getSharedDb()
  const rows = await db.query.connection.findMany({
    where: eq(connection.userId, userId),
    columns: { id: true, accessToken: true },
  })
  if (rows.length === 0) return
  const [{ startWorkflowSafe }, { scheduleSyncConnection, syncConnection }] =
    await Promise.all([
      import("./workflow-start"),
      import("../workflows/sync-connection"),
    ])
  await Promise.allSettled(
    rows
      .filter((row) => row.accessToken)
      .map((row) =>
        startWorkflowSafe(
          scheduleSyncConnection as (input: never) => Promise<unknown>,
          { connectionId: row.id, userId },
          // No workflow runtime (dev standalone): one inline cycle instead
          // of an eternal in-process loop.
          () => syncConnection({ connectionId: row.id, userId })
        )
      )
  )
}

/**
 * A connection was just created or re-linked: start its durable scheduler,
 * run one immediate sync so first paint fills fast, and refresh the shell
 * models. Fire-and-forget from the caller's perspective; every part is
 * idempotent.
 */
export async function activateConnectionSync(
  userId: string,
  connectionId: string
): Promise<void> {
  const [{ startWorkflowSafe }, { scheduleSyncConnection, syncConnection }] =
    await Promise.all([
      import("./workflow-start"),
      import("../workflows/sync-connection"),
    ])
  await Promise.allSettled([
    startWorkflowSafe(
      scheduleSyncConnection as (input: never) => Promise<unknown>,
      { connectionId, userId },
      () => syncConnection({ connectionId, userId })
    ),
    startWorkflowSafe(
      syncConnection as (input: never) => Promise<unknown>,
      { connectionId, userId },
      () => syncConnection({ connectionId, userId })
    ),
    primeUserSyncRecords(userId),
  ])
}
