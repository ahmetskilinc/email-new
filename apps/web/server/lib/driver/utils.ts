import { markConnectionReauthRequired } from "../token-store"
import type { gmail_v1 } from "@googleapis/gmail"

import { toByteArray } from "base64-js"
export const FatalErrors = ["invalid_grant"]

/**
 * Flags the connection that hit a fatal auth error as needing re-consent.
 * This used to DELETE the row, silently losing the account (and bouncing the
 * user to onboarding); the row and its encrypted tokens now survive so the
 * reconnect banner can re-link in place. `email` identifies the specific
 * connection — without it we refuse to act rather than flagging whichever
 * connection happens to be "active" for the user.
 */
export const markActiveConnectionReauthRequired = async (
  userId?: string,
  email?: string
) => {
  if (!userId || !email) {
    console.warn(
      "markActiveConnectionReauthRequired called without userId/email, skipping"
    )
    return
  }
  try {
    await markConnectionReauthRequired(userId, email)
  } catch (error) {
    console.error("Server: Error flagging connection for reauth:", error)
  }
}

export const fromBase64Url = (str: string) => {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/")
  // Gmail strips base64 padding; re-add it so standard decoders accept it.
  return base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "="
  )
}

export const fromBinary = (str: string) =>
  new TextDecoder().decode(
    toByteArray(str.replace(/-/g, "+").replace(/_/g, "/"))
  )

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const findHtmlBody = (parts: any[]): string => {
  for (const part of parts) {
    if (part.mimeType === "text/html" && part.body?.data) {
      return part.body.data
    }
    if (part.parts) {
      const found = findHtmlBody(part.parts)
      if (found) return found
    }
  }
  console.log("⚠️ Driver: No HTML content found in message parts")
  return ""
}

export class StandardizedError extends Error {
  code: string
  operation: string
  context?: Record<string, unknown>
  originalError: unknown
  constructor(
    error: Error & { code: string },
    operation: string,
    context?: Record<string, unknown>
  ) {
    super(error?.message || "An unknown error occurred")
    this.name = "StandardizedError"
    this.code = error?.code || "UNKNOWN_ERROR"
    this.operation = operation
    this.context = context
    this.originalError = error
  }
}

export function sanitizeContext(context?: Record<string, unknown>) {
  if (!context) return undefined
  const sanitized = { ...context }
  // This context ends up in error logs, so anything that could carry a
  // credential has to be named here — the list previously stopped at
  // refresh_token and let access tokens, passwords and auth headers through.
  const normalize = (key: string) => key.toLowerCase().replace(/[_-]/g, "")
  const sensitive = [
    "tokens",
    "token",
    "access_token",
    "refresh_token",
    "id_token",
    "password",
    "authorization",
    "cookie",
    "code",
    "message",
    "raw",
    "data",
  ].map(normalize)
  for (const key of Object.keys(sanitized)) {
    if (sensitive.includes(normalize(key))) {
      sanitized[key] = "[REDACTED]"
    }
  }
  return sanitized
}

/**
 * Retrieves the original sender address for a forwarded email from SimpleLogin
 * from the headers of a Gmail email. Header: `X-SimpleLogin-Original-From`
 */
export function getSimpleLoginSender(
  payload: gmail_v1.Schema$Message["payload"]
) {
  return (
    payload?.headers?.find((h) => h.name === "X-SimpleLogin-Original-From")
      ?.value || null
  )
}
