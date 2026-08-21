import {
  ICLOUD_SERVICE_HOST_SUFFIX,
  ICLOUD_SETUP_ORIGIN,
  ICLOUD_VALIDATE_PATH,
  ICLOUD_WEB_ORIGIN,
  ICLOUD_REQUEST_TIMEOUT_MS,
  REAUTH_STATUSES,
} from "./constants"
import {
  ICloudProtocolError,
  ICloudReauthRequiredError,
  ICloudWebServiceError,
} from "./errors"
import {
  mergeSetCookies,
  parseCookieHeader,
  serializeCookies,
  type ICloudWebSession,
} from "./session"

export type ICloudBootstrap = {
  dsid: string
  mailServiceUrl: string
  primaryEmail: string
  fullName: string
  /** Present only when Apple rotated cookies on this response. */
  refreshedCookies?: string
}

/**
 * Rejects any service URL that is not an HTTPS host under `*.icloud.com`.
 *
 * The URL comes out of Apple's bootstrap response and is then used as the base
 * for requests that carry the user's full iCloud session cookie. Trusting it
 * unconditionally would mean a spoofed or tampered bootstrap could redirect
 * that credential anywhere.
 */
export function assertIcloudServiceUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new ICloudProtocolError(
      "iCloud returned a mail service URL that is not a valid URL."
    )
  }
  if (url.protocol !== "https:") {
    throw new ICloudProtocolError("iCloud mail service URL must use HTTPS.")
  }
  const host = url.hostname.toLowerCase()
  if (!host.endsWith(ICLOUD_SERVICE_HOST_SUFFIX)) {
    throw new ICloudProtocolError(
      "iCloud mail service URL points outside icloud.com; refusing to use it."
    )
  }
  return url
}

function readSetCookies(response: Response): string[] {
  const anyHeaders = response.headers as Headers & {
    getSetCookie?: () => string[]
  }
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie()
  }
  const single = response.headers.get("set-cookie")
  return single ? [single] : []
}

/**
 * Validates the captured session against Apple and reads the per-account
 * webservices map out of the response.
 *
 * The `pXX` shard in `pXX-mailws.icloud.com` is account-specific, so this must
 * run before any mailbox call — hard-coding a shard works right up until it
 * silently does not.
 */
export async function discoverWebServices(
  session: ICloudWebSession,
  fetchImpl: typeof fetch = fetch
): Promise<ICloudBootstrap> {
  const url = new URL(ICLOUD_VALIDATE_PATH, ICLOUD_SETUP_ORIGIN)
  url.searchParams.set("clientBuildNumber", session.clientBuildNumber)
  url.searchParams.set("clientMasteringNumber", session.clientMasteringNumber)
  url.searchParams.set("clientId", session.clientId)
  if (session.dsid) url.searchParams.set("dsid", session.dsid)

  let response: Response
  try {
    response = await fetchImpl(url.toString(), {
      method: "POST",
      headers: {
        Cookie: session.cookies,
        Origin: ICLOUD_WEB_ORIGIN,
        Referer: `${ICLOUD_WEB_ORIGIN}/`,
        "Content-Type": "text/plain",
        Accept: "*/*",
      },
      body: "",
      redirect: "manual",
      signal: AbortSignal.timeout(ICLOUD_REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    throw new ICloudWebServiceError(
      "Could not reach iCloud to validate the session.",
      { endpoint: ICLOUD_VALIDATE_PATH, cause }
    )
  }

  if (REAUTH_STATUSES.has(response.status)) {
    throw new ICloudReauthRequiredError(
      "iCloud rejected the session. Sign in to iCloud.com again and re-import the session.",
      { status: response.status, endpoint: ICLOUD_VALIDATE_PATH }
    )
  }
  if (!response.ok) {
    throw new ICloudWebServiceError(
      `iCloud bootstrap failed with status ${response.status}.`,
      { status: response.status, endpoint: ICLOUD_VALIDATE_PATH }
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (cause) {
    throw new ICloudProtocolError(
      "iCloud bootstrap returned a body that is not JSON.",
      { endpoint: ICLOUD_VALIDATE_PATH, cause }
    )
  }

  const bootstrap = readBootstrap(payload)

  const jar = parseCookieHeader(session.cookies)
  const { changed } = mergeSetCookies(jar, readSetCookies(response))

  return {
    ...bootstrap,
    refreshedCookies: changed ? serializeCookies(jar) : undefined,
  }
}

/**
 * Pulls the fields we need out of the bootstrap payload.
 *
 * Kept separate from the fetch so it can be tested against recorded responses —
 * this shape is the single most likely thing to change under us.
 */
export function readBootstrap(
  payload: unknown
): Omit<ICloudBootstrap, "refreshedCookies"> {
  if (!payload || typeof payload !== "object") {
    throw new ICloudProtocolError("iCloud bootstrap payload was empty.")
  }
  const root = payload as Record<string, unknown>
  const dsInfo = asRecord(root.dsInfo)
  const webservices = asRecord(root.webservices)
  const mail = asRecord(webservices?.mail)

  const rawUrl = typeof mail?.url === "string" ? mail.url : undefined
  if (!rawUrl) {
    throw new ICloudProtocolError(
      "iCloud did not return a mail web service for this account. Mail may not be enabled on it."
    )
  }

  const status = typeof mail?.status === "string" ? mail.status : "active"
  if (status.toLowerCase() !== "active") {
    throw new ICloudProtocolError(
      `iCloud reports the mail web service as "${status}" for this account.`
    )
  }

  const url = assertIcloudServiceUrl(rawUrl)

  const dsid =
    stringOf(dsInfo?.dsid) ?? stringOf(root.dsid) ?? stringOf(dsInfo?.aDsID)
  if (!dsid) {
    throw new ICloudProtocolError(
      "iCloud bootstrap did not include an account identifier (dsid)."
    )
  }

  const primaryEmail =
    stringOf(dsInfo?.primaryEmail) ?? stringOf(dsInfo?.appleId) ?? ""
  const fullName =
    stringOf(dsInfo?.fullName) ??
    [stringOf(dsInfo?.firstName), stringOf(dsInfo?.lastName)]
      .filter(Boolean)
      .join(" ")
      .trim()

  return {
    dsid,
    // Apple returns the port explicitly (`:443`); normalising through URL keeps
    // the base stable regardless.
    mailServiceUrl: url.origin,
    primaryEmail,
    fullName,
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined
}

function stringOf(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return undefined
}
