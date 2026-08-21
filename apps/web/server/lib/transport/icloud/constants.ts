/**
 * Wire constants for the iCloud Mail WebService.
 *
 * Everything here is derived from what iCloud.com's own Mail frontend sends.
 * None of it is contractual — see docs/icloud-mailws.md for the capture
 * procedure to re-derive these when Apple changes them.
 */

/** Apple's account bootstrap host. Returns the per-account webservices map. */
export const ICLOUD_SETUP_ORIGIN = "https://setup.icloud.com"

/** Validates an existing web session and returns the webservices map. */
export const ICLOUD_VALIDATE_PATH = "/setup/ws/1/validate"

/** The origin iCloud.com's Mail frontend runs on; mailws checks it. */
export const ICLOUD_WEB_ORIGIN = "https://www.icloud.com"

/**
 * Build number of the iCloud.com web client. Apple rejects requests carrying a
 * build it considers too old, so this is expected to need periodic bumping —
 * it is overridable per connection via the captured session.
 */
export const DEFAULT_CLIENT_BUILD_NUMBER = "2413Project37"

/** Client-version string sent alongside the build number. */
export const DEFAULT_CLIENT_MASTERING_NUMBER = "2413B32"

/**
 * Only hosts under this suffix may be used as a mail service base URL. The URL
 * arrives from Apple's bootstrap response, i.e. from off-box data — without a
 * check, a compromised or spoofed bootstrap turns every subsequent mailbox call
 * into an SSRF with the user's session cookies attached.
 */
export const ICLOUD_SERVICE_HOST_SUFFIX = ".icloud.com"

/** mailws endpoints. `/wm` is Apple's long-standing Web Mail interface. */
export const WM_ENDPOINTS = {
  folder: "/wm/folder",
  message: "/wm/message",
} as const

/** Names of the cookies that actually carry the iCloud web session. */
export const ICLOUD_AUTH_COOKIES = [
  "X-APPLE-WEBAUTH-TOKEN",
  "X-APPLE-WEBAUTH-USER",
  "X-APPLE-WEBAUTH-HSA-TRUST",
  "X-APPLE-DS-WEB-SESSION-TOKEN",
] as const

/** At least one of these must be present for a session to be worth trying. */
export const ICLOUD_REQUIRED_AUTH_COOKIES = [
  "X-APPLE-WEBAUTH-TOKEN",
  "X-APPLE-DS-WEB-SESSION-TOKEN",
] as const

/** HTTP statuses Apple uses to say "this session is no longer good". */
export const REAUTH_STATUSES = new Set([401, 403, 421, 450])

/** Per-request ceiling. mailws is normally sub-second; a hang must not pin a worker. */
export const ICLOUD_REQUEST_TIMEOUT_MS = 20_000

/** Default page size when the caller does not specify one. */
export const DEFAULT_PAGE_SIZE = 50

/** Hard ceiling on a single mailws page, to keep responses bounded. */
export const MAX_PAGE_SIZE = 200
