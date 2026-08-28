import { and, eq } from "drizzle-orm"
import type { SyncServerOptions } from "@ahmetskilinc/sync-server"
import {
  CLIENT_WRITABLE,
  MailOp,
  ThreadPreview,
  type MailOpKind,
} from "@workspace/core/sync"
import { connection, syncRecord } from "../db/schema"
import { getSharedDb } from "../db"

const MAIL_OPS: ReadonlySet<MailOpKind> = new Set([
  "archive",
  "delete",
  "markRead",
  "markUnread",
  "star",
  "unstar",
  "modifyLabels",
])

const MAX_THREADS_PER_OP = 500
const MAX_LABELS = 50
const MAX_LABEL_LENGTH = 200

const isStringArray = (value: unknown, maxLen: number, maxItem: number) =>
  Array.isArray(value) &&
  value.length <= maxLen &&
  value.every((v) => typeof v === "string" && v.length > 0 && v.length <= maxItem)

/**
 * Pure write authorization for one user partition — no side effects here
 * (provider calls live in the provider-ops workflow, driven by MailOp rows).
 * Everything not explicitly allowed is rejected: clients may patch a
 * ThreadPreview's flags/labels and create MailOps, nothing else.
 */
export function makeValidateTransaction(
  userId: string
): NonNullable<SyncServerOptions["validateTransaction"]> {
  return async (transaction, context) => {
    const ctx = context as { userId?: string } | undefined
    if (!ctx?.userId || ctx.userId !== userId) return "Unauthenticated"
    const { db } = getSharedDb()

    for (const mutation of transaction.mutations) {
      const rules = CLIENT_WRITABLE[mutation.model as keyof typeof CLIENT_WRITABLE]
      if (!rules) return `Model "${mutation.model}" is read-only`
      if (!(rules.operations as readonly string[]).includes(mutation.type)) {
        return `Operation "${mutation.type}" is not allowed on "${mutation.model}"`
      }

      if (mutation.model === ThreadPreview.name && mutation.type === "update") {
        for (const key of Object.keys(mutation.data)) {
          if (!(rules.properties as readonly string[]).includes(key)) {
            return `Property "${key}" is not client-writable on ThreadPreview`
          }
        }
        if (
          "labels" in mutation.data &&
          !isStringArray(mutation.data.labels, MAX_LABELS, MAX_LABEL_LENGTH)
        ) {
          return "Invalid labels"
        }
        // Ownership: the record must exist in THIS user's partition.
        const row = await db.query.syncRecord.findFirst({
          columns: { id: true },
          where: and(
            eq(syncRecord.model, ThreadPreview.name),
            eq(syncRecord.id, mutation.id),
            eq(syncRecord.userId, userId)
          ),
        })
        if (!row) return "Thread not found"
      }

      if (mutation.model === MailOp.name && mutation.type === "create") {
        const data = mutation.data
        if (data.userId !== userId) return "MailOp userId mismatch"
        if (data.status !== "pending") return "MailOp must be created pending"
        if (data.attempts !== 0) return "MailOp attempts must start at 0"
        if (!MAIL_OPS.has(data.op as MailOpKind)) return "Unknown MailOp op"
        if (!isStringArray(data.threadIds, MAX_THREADS_PER_OP, 500)) {
          return "Invalid MailOp threadIds"
        }
        for (const key of ["addLabels", "removeLabels"] as const) {
          const value = data[key]
          if (
            value != null &&
            !isStringArray(value, MAX_LABELS, MAX_LABEL_LENGTH)
          ) {
            return `Invalid MailOp ${key}`
          }
        }
        // The referenced connection must belong to this user.
        const owned = await db.query.connection.findFirst({
          columns: { id: true },
          where: and(
            eq(connection.id, String(data.connectionId ?? "")),
            eq(connection.userId, userId)
          ),
        })
        if (!owned) return "Connection not found"
      }
    }
    return null
  }
}
