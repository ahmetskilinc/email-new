import {
  ICLOUD_REQUEST_TIMEOUT_MS,
  ICLOUD_WEB_ORIGIN,
  REAUTH_STATUSES,
} from "./constants"
import {
  ICloudProtocolError,
  ICloudReauthRequiredError,
  ICloudWebServiceError,
} from "./errors"
import { assertIcloudServiceUrl, discoverWebServices } from "./bootstrap"
import {
  mergeSetCookies,
  parseCookieHeader,
  redactSession,
  serializeCookies,
  type ICloudWebSession,
} from "./session"

export type SessionPersistFn = (
  session: ICloudWebSession
) => void | Promise<void>

export type ICloudClientOptions = {
  session: ICloudWebSession
  /**
   * Called whenever Apple rotates cookies or discovery fills in the mail URL,
   * so the refreshed session replaces the stored one. Failures here are logged
   * and swallowed: losing a cookie rotation degrades the session, it does not
   * break the request that is in flight.
   */
  onSessionUpdate?: SessionPersistFn
  fetchImpl?: typeof fetch
}

type WmResponse = Record<string, unknown>

/**
 * Authenticated HTTP client for `pXX-mailws.icloud.com`.
 *
 * Responsibilities kept here rather than in the operations layer:
 *  - lazy service discovery (the shard is account-specific)
 *  - the query-parameter triple every `/wm/*` call needs
 *  - cookie rotation
 *  - turning Apple's auth failures into a single, explicit reauth signal
 *  - never logging the credential
 */
export class ICloudWebServiceClient {
  private session: ICloudWebSession
  private readonly onSessionUpdate?: SessionPersistFn
  private readonly fetchImpl: typeof fetch
  private discovery: Promise<string> | null = null

  constructor(options: ICloudClientOptions) {
    this.session = options.session
    this.onSessionUpdate = options.onSessionUpdate
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  getSession(): ICloudWebSession {
    return this.session
  }

  /** Safe-to-log view of the credential. Never log `this.session` directly. */
  describe(): Record<string, unknown> {
    return redactSession(this.session)
  }

  /**
   * Resolves the account's mail service base URL, running Apple's bootstrap
   * once per client and caching the promise so concurrent calls share it.
   */
  async getMailServiceUrl(): Promise<string> {
    if (this.session.mailServiceUrl) {
      return assertIcloudServiceUrl(this.session.mailServiceUrl).origin
    }
    if (!this.discovery) {
      this.discovery = discoverWebServices(this.session, this.fetchImpl)
        .then(async (bootstrap) => {
          await this.updateSession({
            dsid: this.session.dsid || bootstrap.dsid,
            mailServiceUrl: bootstrap.mailServiceUrl,
            ...(bootstrap.refreshedCookies
              ? { cookies: bootstrap.refreshedCookies }
              : {}),
          })
          return bootstrap.mailServiceUrl
        })
        .catch((error) => {
          // A failed discovery must not be cached: the next call should get a
          // fresh attempt rather than replaying a stale rejection forever.
          this.discovery = null
          throw error
        })
    }
    return this.discovery
  }

  /** Runs bootstrap unconditionally and returns the account identity. */
  async bootstrap() {
    const result = await discoverWebServices(this.session, this.fetchImpl)
    await this.updateSession({
      dsid: this.session.dsid || result.dsid,
      mailServiceUrl: result.mailServiceUrl,
      ...(result.refreshedCookies ? { cookies: result.refreshedCookies } : {}),
    })
    return result
  }

  /**
   * Issues one `/wm/*` call.
   *
   * The body is Apple's Web Mail JSON. It is sent as `text/plain` because that
   * is what iCloud.com sends — mailws is picky about the content type, and a
   * `application/json` body also turns the request into a CORS preflight in the
   * browser, which is why Apple's own frontend avoids it.
   */
  async call<T = WmResponse>(
    endpoint: string,
    body: unknown,
    options: { extraQuery?: Record<string, string> } = {}
  ): Promise<T> {
    const base = await this.getMailServiceUrl()
    const url = new URL(endpoint, base)
    url.searchParams.set("clientBuildNumber", this.session.clientBuildNumber)
    url.searchParams.set(
      "clientMasteringNumber",
      this.session.clientMasteringNumber
    )
    url.searchParams.set("clientId", this.session.clientId)
    if (this.session.dsid) url.searchParams.set("dsid", this.session.dsid)
    for (const [key, value] of Object.entries(options.extraQuery ?? {})) {
      url.searchParams.set(key, value)
    }

    let response: Response
    try {
      response = await this.fetchImpl(url.toString(), {
        method: "POST",
        headers: {
          Cookie: this.session.cookies,
          Origin: ICLOUD_WEB_ORIGIN,
          Referer: `${ICLOUD_WEB_ORIGIN}/`,
          "Content-Type": "text/plain",
          Accept: "*/*",
        },
        body: JSON.stringify(body ?? {}),
        redirect: "manual",
        signal: AbortSignal.timeout(ICLOUD_REQUEST_TIMEOUT_MS),
      })
    } catch (cause) {
      throw new ICloudWebServiceError(
        "Could not reach the iCloud mail service.",
        { endpoint, cause }
      )
    }

    await this.absorbCookies(response)

    if (REAUTH_STATUSES.has(response.status)) {
      throw new ICloudReauthRequiredError(undefined, {
        status: response.status,
        endpoint,
      })
    }
    if (response.status === 404 || response.status === 410) {
      // The endpoint itself is gone — Apple moved the protocol, which is a
      // different problem from "the mailbox call failed".
      throw new ICloudProtocolError(
        `iCloud mail service no longer serves ${endpoint} (status ${response.status}).`,
        { endpoint }
      )
    }
    if (!response.ok) {
      throw new ICloudWebServiceError(
        `iCloud mail service returned status ${response.status} for ${endpoint}.`,
        { status: response.status, endpoint }
      )
    }

    const text = await response.text()
    if (!text.trim()) return {} as T

    try {
      return JSON.parse(text) as T
    } catch (cause) {
      throw new ICloudProtocolError(
        `iCloud mail service returned a non-JSON body for ${endpoint}.`,
        { endpoint, cause }
      )
    }
  }

  private async absorbCookies(response: Response) {
    const anyHeaders = response.headers as Headers & {
      getSetCookie?: () => string[]
    }
    const setCookies =
      typeof anyHeaders.getSetCookie === "function"
        ? anyHeaders.getSetCookie()
        : (() => {
            const single = response.headers.get("set-cookie")
            return single ? [single] : []
          })()
    if (setCookies.length === 0) return

    const jar = parseCookieHeader(this.session.cookies)
    const { changed } = mergeSetCookies(jar, setCookies)
    if (changed) await this.updateSession({ cookies: serializeCookies(jar) })
  }

  private async updateSession(patch: Partial<ICloudWebSession>) {
    this.session = {
      ...this.session,
      ...patch,
      refreshedAt: new Date().toISOString(),
    }
    if (!this.onSessionUpdate) return
    try {
      await this.onSessionUpdate(this.session)
    } catch (error) {
      console.error(
        "[icloud:mailws] failed to persist refreshed session",
        // Redacted deliberately: this object must never carry cookie values.
        redactSession(this.session),
        error instanceof Error ? error.message : error
      )
    }
  }
}
