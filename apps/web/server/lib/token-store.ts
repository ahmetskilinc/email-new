import { and, eq, lt, sql } from "drizzle-orm"
import { connection } from "../db/schema"
import { getSharedDb } from "../db"
import { decryptSecret, encrypt, isEncrypted } from "./encryption"
import { logSecurityEvent } from "./audit"
import { env } from "../env"

/**
 * Persistence for refreshed provider tokens.
 *
 * The drivers used to refresh access tokens in memory only, so every server
 * action on a stale token re-paid the 401 → refresh → retry dance, and
 * Microsoft's *rotated* refresh tokens were dropped outright — which is how
 * Microsoft connections died. This module is deliberately a leaf (db +
 * encryption only) so both the drivers and the auth layer can import it
 * without deepening the existing server-utils ↔ driver import cycle.
 */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const MICROSOFT_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token"

/** Refresh this long before the recorded expiry. */
const INTERACTIVE_SKEW_MS = 2 * 60 * 1000

const encryptSecret = (value: string | null | undefined): string | null => {
  if (!value) return null
  return isEncrypted(value) ? value : encrypt(value)
}

export type RefreshedTokens = {
  accessToken: string
  /** Only Microsoft rotates refresh tokens; absent means "keep the stored one". */
  refreshToken?: string | null
  expiresAt: Date
}

/**
 * Writes a refreshed token set back to the connection row. The
 * `expires_at < new` predicate makes concurrent refreshers last-writer-safe
 * without a lock: a stale racer's older token can never overwrite a newer one.
 * Also clears reauth_required — a successful refresh proves the grant lives.
 */
export async function persistRefreshedTokens(
  userId: string,
  connectionId: string,
  tokens: RefreshedTokens
): Promise<void> {
  const { db } = getSharedDb()
  await db
    .update(connection)
    .set({
      accessToken: encryptSecret(tokens.accessToken),
      ...(tokens.refreshToken
        ? { refreshToken: encryptSecret(tokens.refreshToken) }
        : {}),
      expiresAt: tokens.expiresAt,
      status: "active",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(connection.id, connectionId),
        eq(connection.userId, userId),
        lt(connection.expiresAt, tokens.expiresAt)
      )
    )
}

/**
 * Marks a connection as needing re-consent instead of deleting it. The row
 * (and its encrypted tokens) survives, so a re-link through the provider
 * restores the account without the user rebuilding anything.
 */
export async function markConnectionReauthRequired(
  userId: string,
  email: string
): Promise<void> {
  const { db } = getSharedDb()
  await db
    .update(connection)
    .set({ status: "reauth_required", updatedAt: new Date() })
    .where(and(eq(connection.userId, userId), eq(connection.email, email)))
  await logSecurityEvent("connection_reauth_required", userId, { email })
}

type TokenEndpointResult =
  | { ok: true; accessToken: string; refreshToken: string | null; expiresAt: Date }
  | { ok: false; fatal: boolean; error: string }

async function exchangeRefreshToken(
  providerId: string,
  refreshToken: string,
  scope: string
): Promise<TokenEndpointResult> {
  const isGoogle = providerId === "google"
  const url = isGoogle ? GOOGLE_TOKEN_URL : MICROSOFT_TOKEN_URL
  const body = new URLSearchParams({
    client_id: isGoogle ? env.GOOGLE_CLIENT_ID : env.MICROSOFT_CLIENT_ID,
    client_secret: isGoogle
      ? env.GOOGLE_CLIENT_SECRET
      : env.MICROSOFT_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    // Google ignores scope on refresh; Microsoft narrows to it (and falls
    // back to the original grant when present), so pass the stored grant.
    ...(isGoogle ? {} : { scope }),
  })

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => ({}))

  if (!res.ok || !data.access_token) {
    return {
      ok: false,
      fatal: data.error === "invalid_grant",
      error:
        data.error_description ||
        data.error ||
        `token refresh failed (${res.status})`,
    }
  }

  return {
    ok: true,
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string | undefined) ?? null,
    expiresAt: new Date(Date.now() + Number(data.expires_in ?? 3600) * 1000),
  }
}

const OAUTH_PROVIDERS = new Set(["google", "microsoft"])

/**
 * Ensures the row's access token is valid for at least `skewMs` more, doing a
 * single-flight refresh when it isn't. Serialized per connection via a
 * Postgres advisory transaction lock — mandatory for Microsoft, whose token
 * endpoint ROTATES the refresh token: two concurrent exchanges would leave
 * one instance holding a dead credential.
 *
 * Returns the (possibly updated) connection row. Interactive callers get a
 * token that never needs the drivers' 401-retry path; the sync workflow calls
 * this proactively each cycle so interactive requests rarely even wait here.
 */
export async function ensureFreshAccessToken<
  T extends typeof connection.$inferSelect,
>(conn: T, skewMs: number = INTERACTIVE_SKEW_MS): Promise<T> {
  if (!OAUTH_PROVIDERS.has(conn.providerId)) return conn
  if (!conn.refreshToken) return conn
  if (conn.expiresAt.getTime() - skewMs > Date.now()) return conn

  const { db } = getSharedDb()
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${conn.id}))`
    )
    // Re-read inside the lock: a concurrent holder may have refreshed already.
    const [fresh] = await tx
      .select()
      .from(connection)
      .where(and(eq(connection.id, conn.id), eq(connection.userId, conn.userId)))
    if (!fresh?.refreshToken) return conn
    if (fresh.expiresAt.getTime() - skewMs > Date.now()) return fresh as T

    const result = await exchangeRefreshToken(
      fresh.providerId,
      decryptSecret(fresh.refreshToken),
      fresh.scope
    ).catch((error): TokenEndpointResult => {
      // Network failure: not fatal, keep the stored token and let the
      // driver's own retry path handle it.
      return { ok: false, fatal: false, error: String(error) }
    })

    if (!result.ok) {
      if (result.fatal) {
        await tx
          .update(connection)
          .set({ status: "reauth_required", updatedAt: new Date() })
          .where(eq(connection.id, fresh.id))
        await logSecurityEvent("connection_reauth_required", fresh.userId, {
          email: fresh.email,
        })
      }
      return fresh as T
    }

    const accessToken = encryptSecret(result.accessToken)
    const refreshToken = result.refreshToken
      ? encryptSecret(result.refreshToken)
      : fresh.refreshToken
    await tx
      .update(connection)
      .set({
        accessToken,
        refreshToken,
        expiresAt: result.expiresAt,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(connection.id, fresh.id))

    return {
      ...(fresh as T),
      accessToken,
      refreshToken,
      expiresAt: result.expiresAt,
      status: "active" as const,
    }
  })
}
