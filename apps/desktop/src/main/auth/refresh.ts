import { eq } from "drizzle-orm"
import https from "node:https"
import { URL, URLSearchParams } from "node:url"
import { getDb } from "../db"
import { connection } from "../db/schema"
import { decryptNullable, encryptNullable } from "./credentials"

/**
 * Connections this close to expiry (or already expired) are refreshed before
 * they're handed to a driver. 2 minutes gives enough headroom for a long-
 * running API call to complete before the server-side grace window closes.
 */
const EXPIRY_GRACE_MS = 2 * 60 * 1000

type Conn = typeof connection.$inferSelect

function isExpiringSoon(conn: Conn): boolean {
  if (!conn.expiresAt) return false
  return conn.expiresAt.getTime() - Date.now() < EXPIRY_GRACE_MS
}

/** Return a conn with access/refresh tokens decrypted in place. */
function decryptConn(conn: Conn): Conn {
  return {
    ...conn,
    accessToken: decryptNullable(conn.accessToken),
    refreshToken: decryptNullable(conn.refreshToken),
  }
}

interface MicrosoftTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

function postForm(
  url: string,
  body: string,
): Promise<MicrosoftTokenResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = ""
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString()
        })
        res.on("end", () => {
          try {
            resolve(JSON.parse(data) as MicrosoftTokenResponse)
          } catch (err) {
            reject(
              err instanceof Error
                ? err
                : new Error("Failed to parse token response"),
            )
          }
        })
      },
    )
    req.on("error", reject)
    req.write(body)
    req.end()
  })
}

async function refreshMicrosoft(conn: Conn): Promise<Conn> {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET in environment",
    )
  }
  if (!conn.refreshToken) {
    throw new Error("Cannot refresh Microsoft connection: no refresh token")
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: conn.refreshToken,
    grant_type: "refresh_token",
  }).toString()

  const json = await postForm(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    body,
  )

  if (json.error) {
    throw new Error(
      `Microsoft token refresh failed: ${json.error_description ?? json.error}`,
    )
  }

  const now = new Date()
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000)
  const newAccessToken = json.access_token ?? conn.accessToken
  // Microsoft may or may not rotate the refresh token — keep the old one
  // if the response omits it.
  const newRefreshToken = json.refresh_token ?? conn.refreshToken

  const db = getDb()
  db.update(connection)
    .set({
      accessToken: encryptNullable(newAccessToken),
      refreshToken: encryptNullable(newRefreshToken),
      expiresAt,
      updatedAt: now,
    })
    .where(eq(connection.id, conn.id))
    .run()

  return {
    ...conn,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresAt,
    updatedAt: now,
  }
}

interface GoogleTokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function refreshGoogle(conn: Conn): Promise<Conn> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in environment",
    )
  }
  if (!conn.refreshToken) {
    throw new Error("Cannot refresh Google connection: no refresh token")
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: conn.refreshToken,
    grant_type: "refresh_token",
  }).toString()

  const json = (await postForm(
    "https://oauth2.googleapis.com/token",
    body,
  )) as GoogleTokenResponse

  if (json.error) {
    throw new Error(
      `Google token refresh failed: ${json.error_description ?? json.error}`,
    )
  }

  const now = new Date()
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000)
  const newAccessToken = json.access_token ?? conn.accessToken

  const db = getDb()
  db.update(connection)
    .set({
      accessToken: encryptNullable(newAccessToken),
      expiresAt,
      updatedAt: now,
    })
    .where(eq(connection.id, conn.id))
    .run()

  return {
    ...conn,
    accessToken: newAccessToken,
    expiresAt,
    updatedAt: now,
  }
}

/**
 * Decrypt the connection's tokens and, if they're expired or near-expiry,
 * refresh them (persisting the new values back to the DB in encrypted form).
 * Returns a connection record with plaintext tokens that callers can hand
 * directly to `createDriver`.
 *
 * IMAP / unknown providers fall through without a refresh attempt — their
 * `accessToken` is treated as a bearer secret (e.g. an app password) that
 * never expires. The caller still gets a decrypted copy.
 */
export async function ensureFreshTokens(conn: Conn): Promise<Conn> {
  const plain = decryptConn(conn)
  if (!isExpiringSoon(plain)) return plain

  try {
    switch (plain.providerId) {
      case "microsoft":
        return await refreshMicrosoft(plain)
      case "google":
        return await refreshGoogle(plain)
      default:
        return plain
    }
  } catch (err) {
    console.error(
      `[auth] failed to refresh ${plain.providerId} connection ${plain.id}:`,
      err,
    )
    // Fall through with the stale token — the driver will invoke
    // onAuthFailure if the token is actually rejected.
    return plain
  }
}
