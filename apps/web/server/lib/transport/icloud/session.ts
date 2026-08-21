import {
  DEFAULT_CLIENT_BUILD_NUMBER,
  DEFAULT_CLIENT_MASTERING_NUMBER,
  ICLOUD_AUTH_COOKIES,
  ICLOUD_REQUIRED_AUTH_COOKIES,
} from "./constants"

/**
 * An authenticated iCloud.com web session.
 *
 * This is the whole credential: whoever holds `cookies` is signed in as the
 * user on iCloud.com — not merely to Mail. It must be encrypted at rest, never
 * sent to the browser, and never logged unredacted. `redactSession` exists so
 * that there is a safe thing to log.
 */
export type ICloudWebSession = {
  /** Serialized cookie header, e.g. `X-APPLE-WEBAUTH-TOKEN=...; X-APPLE-WEBAUTH-USER=...`. */
  cookies: string
  /** Apple's account identifier, needed as a query parameter on every mailws call. */
  dsid: string
  /** Per-client UUID the frontend generates once and reuses. */
  clientId: string
  /** iCloud.com web build the requests claim to come from. */
  clientBuildNumber: string
  clientMasteringNumber: string
  /** `webservices.mail.url` from the bootstrap response, once discovered. */
  mailServiceUrl?: string
  /** ISO timestamps for observability; not part of the credential. */
  capturedAt: string
  refreshedAt?: string
}

export type ICloudSessionInput = {
  cookies: string
  dsid?: string
  clientId?: string
  clientBuildNumber?: string
  clientMasteringNumber?: string
  mailServiceUrl?: string
}

const COOKIE_SPLIT = /;\s*/

/** Parses a `Cookie:` header into a name → value map, preserving order. */
export function parseCookieHeader(raw: string): Map<string, string> {
  const jar = new Map<string, string>()
  for (const pair of raw.split(COOKIE_SPLIT)) {
    if (!pair) continue
    const eq = pair.indexOf("=")
    if (eq <= 0) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (name) jar.set(name, value)
  }
  return jar
}

export function serializeCookies(jar: Map<string, string>): string {
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ")
}

/**
 * Folds `Set-Cookie` response headers back into the jar so a session that Apple
 * rotates mid-flight keeps working. Deletion (`Max-Age=0` / an expiry in the
 * past) is honoured — a stale token left in the jar is worse than none.
 */
export function mergeSetCookies(
  jar: Map<string, string>,
  setCookieHeaders: string[]
): { jar: Map<string, string>; changed: boolean } {
  let changed = false
  for (const header of setCookieHeaders) {
    const [pair, ...attrs] = header.split(COOKIE_SPLIT)
    if (!pair) continue
    const eq = pair.indexOf("=")
    if (eq <= 0) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (!name) continue

    const expired = attrs.some((attr) => {
      const lower = attr.toLowerCase()
      if (lower.startsWith("max-age=")) {
        const seconds = Number(lower.slice("max-age=".length))
        return Number.isFinite(seconds) && seconds <= 0
      }
      if (lower.startsWith("expires=")) {
        const when = Date.parse(attr.slice("expires=".length))
        return Number.isFinite(when) && when <= Date.now()
      }
      return false
    })

    if (expired) {
      if (jar.delete(name)) changed = true
      continue
    }
    if (jar.get(name) !== value) {
      jar.set(name, value)
      changed = true
    }
  }
  return { jar, changed }
}

/**
 * Reads the DSID out of the `X-APPLE-WEBAUTH-USER` cookie, whose value is a
 * URL-encoded `v=1:s=0:d=<dsid>` triple. The bootstrap response also carries
 * the DSID; this is the cheaper path and lets us validate input before making
 * any network call.
 */
export function dsidFromCookies(jar: Map<string, string>): string | undefined {
  const raw = jar.get("X-APPLE-WEBAUTH-USER")
  if (!raw) return undefined
  const decoded = safeDecode(raw)
  const match = decoded.match(/(?:^|:)d=(\d+)/)
  return match?.[1]
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/** True when the jar holds a cookie that can actually authenticate. */
export function hasAuthCookies(jar: Map<string, string>): boolean {
  return ICLOUD_REQUIRED_AUTH_COOKIES.some((name) => Boolean(jar.get(name)))
}

export class ICloudSessionInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ICloudSessionInputError"
  }
}

/**
 * Accepts the several shapes a user can realistically produce when exporting an
 * authenticated iCloud.com session from their browser:
 *
 *  - a raw `Cookie:` header copied from DevTools ("Copy as cURL" / request view)
 *  - a JSON object `{ "cookies": "...", "dsid": "..." }`
 *  - a JSON array of `{ name, value }` — the shape cookie-export extensions and
 *    Playwright's `context.cookies()` produce
 *
 * Anything else is rejected loudly rather than half-parsed: a session that is
 * silently wrong surfaces later as an unexplained auth failure.
 */
export function parseSessionInput(raw: string): ICloudSessionInput {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new ICloudSessionInputError("No iCloud session data provided.")
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new ICloudSessionInputError(
        "Session data looks like JSON but could not be parsed."
      )
    }
    return fromJson(parsed)
  }

  const stripped = trimmed.replace(/^cookie:\s*/i, "")
  const jar = parseCookieHeader(stripped)
  if (!hasAuthCookies(jar)) {
    throw new ICloudSessionInputError(
      "That cookie header does not contain an iCloud web-auth token. Copy the full Cookie header from a signed-in icloud.com request."
    )
  }
  return { cookies: serializeCookies(jar) }
}

function fromJson(parsed: unknown): ICloudSessionInput {
  if (Array.isArray(parsed)) {
    const jar = new Map<string, string>()
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue
      const name = (entry as { name?: unknown }).name
      const value = (entry as { value?: unknown }).value
      if (typeof name === "string" && typeof value === "string") {
        jar.set(name, value)
      }
    }
    if (!hasAuthCookies(jar)) {
      throw new ICloudSessionInputError(
        "That cookie export does not contain an iCloud web-auth token."
      )
    }
    return { cookies: serializeCookies(jar) }
  }

  if (!parsed || typeof parsed !== "object") {
    throw new ICloudSessionInputError("Unrecognised session data.")
  }

  const obj = parsed as Record<string, unknown>
  const cookieValue =
    pickString(obj, "cookies") ??
    pickString(obj, "cookie") ??
    pickString(obj, "Cookie")

  if (Array.isArray(obj.cookies)) return fromJson(obj.cookies)

  if (!cookieValue) {
    throw new ICloudSessionInputError(
      'Session JSON must contain a "cookies" field with the iCloud cookie header.'
    )
  }

  const jar = parseCookieHeader(cookieValue.replace(/^cookie:\s*/i, ""))
  if (!hasAuthCookies(jar)) {
    throw new ICloudSessionInputError(
      "That session does not contain an iCloud web-auth token."
    )
  }

  return {
    cookies: serializeCookies(jar),
    dsid: pickString(obj, "dsid"),
    clientId: pickString(obj, "clientId"),
    clientBuildNumber: pickString(obj, "clientBuildNumber"),
    clientMasteringNumber: pickString(obj, "clientMasteringNumber"),
    mailServiceUrl: pickString(obj, "mailServiceUrl"),
  }
}

function pickString(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const value = obj[key]
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

/** Builds a complete session from parsed input, filling in the defaults. */
export function buildSession(input: ICloudSessionInput): ICloudWebSession {
  const jar = parseCookieHeader(input.cookies)
  const dsid = input.dsid ?? dsidFromCookies(jar) ?? ""
  return {
    cookies: serializeCookies(jar),
    dsid,
    clientId: input.clientId ?? crypto.randomUUID().toUpperCase(),
    clientBuildNumber: input.clientBuildNumber ?? DEFAULT_CLIENT_BUILD_NUMBER,
    clientMasteringNumber:
      input.clientMasteringNumber ?? DEFAULT_CLIENT_MASTERING_NUMBER,
    mailServiceUrl: input.mailServiceUrl,
    capturedAt: new Date().toISOString(),
  }
}

export function serializeSession(session: ICloudWebSession): string {
  return JSON.stringify(session)
}

export function deserializeSession(raw: string): ICloudWebSession {
  const parsed = JSON.parse(raw) as Partial<ICloudWebSession>
  if (!parsed || typeof parsed.cookies !== "string" || !parsed.cookies) {
    throw new ICloudSessionInputError("Stored iCloud session is unusable.")
  }
  return {
    cookies: parsed.cookies,
    dsid: parsed.dsid ?? "",
    clientId: parsed.clientId ?? crypto.randomUUID().toUpperCase(),
    clientBuildNumber: parsed.clientBuildNumber ?? DEFAULT_CLIENT_BUILD_NUMBER,
    clientMasteringNumber:
      parsed.clientMasteringNumber ?? DEFAULT_CLIENT_MASTERING_NUMBER,
    mailServiceUrl: parsed.mailServiceUrl,
    capturedAt: parsed.capturedAt ?? new Date().toISOString(),
    refreshedAt: parsed.refreshedAt,
  }
}

/**
 * The only representation of a session that may be logged or returned to a
 * caller. Cookie values are replaced by their length; names are kept because
 * *which* cookies are present is exactly what you need when debugging an auth
 * failure, and the names alone are not secret.
 */
export function redactSession(
  session: ICloudWebSession
): Record<string, unknown> {
  const jar = parseCookieHeader(session.cookies)
  const cookieNames = Array.from(jar.keys())
  return {
    cookieNames,
    authCookiesPresent: ICLOUD_AUTH_COOKIES.filter((name) => jar.has(name)),
    cookieBytes: session.cookies.length,
    dsid: session.dsid ? `${session.dsid.slice(0, 3)}…` : null,
    clientId: session.clientId,
    clientBuildNumber: session.clientBuildNumber,
    mailServiceUrl: session.mailServiceUrl ?? null,
    capturedAt: session.capturedAt,
    refreshedAt: session.refreshedAt ?? null,
  }
}
