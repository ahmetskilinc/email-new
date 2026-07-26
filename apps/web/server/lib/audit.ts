import { headers } from "next/headers"
import { randomUUID } from "node:crypto"
import { getSharedDb } from "../db"
import { securityEvent } from "../db/schema"

/**
 * Append-only log of security-relevant events.
 *
 * Logging must never break the operation it is recording, so every failure here
 * is swallowed after being reported to stderr. Nothing sensitive goes into
 * `metadata`: identifiers and counts only, never credentials, tokens, message
 * bodies, or recipient addresses.
 */
export type SecurityEventType =
  | "sign_in"
  | "sign_up"
  | "sign_out"
  | "password_changed"
  | "connection_added"
  | "connection_removed"
  | "mail_sent"
  | "account_deleted"

export async function logSecurityEvent(
  type: SecurityEventType,
  userId: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    let ip: string | null = null
    let userAgent: string | null = null

    try {
      const h = await headers()
      ip =
        h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        h.get("x-real-ip") ??
        null
      userAgent = h.get("user-agent")
    } catch {
      // Outside a request scope (e.g. a background workflow) — record anyway.
    }

    const { db } = getSharedDb()
    await db.insert(securityEvent).values({
      id: randomUUID(),
      userId,
      type,
      ip,
      userAgent,
      metadata: metadata ?? null,
      createdAt: new Date(),
    })
  } catch (error) {
    console.error(
      "[audit] failed to record security event",
      type,
      error instanceof Error ? error.message : error
    )
  }
}
