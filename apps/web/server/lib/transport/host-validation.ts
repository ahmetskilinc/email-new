import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

/**
 * Validation for user-supplied mail server endpoints.
 *
 * Custom connections let a signed-up user name an arbitrary IMAP/SMTP host and
 * port, which the server then connects to. Unvalidated, that is a general
 * purpose SSRF and internal port scanner: point it at 127.0.0.1, 169.254.169.254
 * (cloud metadata), or an RFC1918 address and the connection outcome reports
 * back whether the port is open.
 *
 * Signup is open, so "authenticated attacker" is not a meaningful barrier here.
 */

export const ALLOWED_IMAP_PORTS = [143, 993]
export const ALLOWED_SMTP_PORTS = [25, 465, 587, 2525]

const MAX_HOSTNAME_LENGTH = 253
const HOSTNAME_PATTERN =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i

export class HostValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HostValidationError"
  }
}

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number)
  return (
    ((parts[0] ?? 0) << 24) |
    ((parts[1] ?? 0) << 16) |
    ((parts[2] ?? 0) << 8) |
    (parts[3] ?? 0)
  )
}

/** True for any address that must never be reachable from a user-supplied host. */
export function isBlockedAddress(address: string): boolean {
  const version = isIP(address)

  if (version === 4) {
    const n = ipv4ToInt(address) >>> 0
    // Both sides must be coerced back to unsigned: `&` yields a signed int32,
    // so without the `>>> 0` every range whose first octet is >= 128 (192.168/16,
    // 172.16/12, 169.254/16, …) compares negative-against-positive and silently
    // fails to match.
    const inRange = (cidr: string, bits: number) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
      return (n & mask) >>> 0 === (ipv4ToInt(cidr) & mask) >>> 0
    }

    return (
      inRange("0.0.0.0", 8) || // "this" network
      inRange("10.0.0.0", 8) || // private
      inRange("100.64.0.0", 10) || // CGNAT
      inRange("127.0.0.0", 8) || // loopback
      inRange("169.254.0.0", 16) || // link-local, incl. cloud metadata
      inRange("172.16.0.0", 12) || // private
      inRange("192.0.0.0", 24) || // IETF protocol assignments
      inRange("192.168.0.0", 16) || // private
      inRange("198.18.0.0", 15) || // benchmarking
      inRange("224.0.0.0", 4) || // multicast
      inRange("240.0.0.0", 4) // reserved / broadcast
    )
  }

  if (version === 6) {
    const addr = address.toLowerCase().split("%")[0] ?? ""
    if (addr === "::" || addr === "::1") return true
    // IPv4-mapped (::ffff:a.b.c.d) — re-check against the v4 rules.
    const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped?.[1]) return isBlockedAddress(mapped[1])
    return (
      addr.startsWith("fc") || // unique local
      addr.startsWith("fd") || // unique local
      addr.startsWith("fe8") || // link-local
      addr.startsWith("fe9") ||
      addr.startsWith("fea") ||
      addr.startsWith("feb") ||
      addr.startsWith("ff") // multicast
    )
  }

  return true
}

/**
 * Resolves `host` and rejects it if it is (or resolves to) a non-public
 * address. Returns the resolved addresses so the caller can pin them and avoid
 * a DNS-rebinding window between validation and connect.
 */
export async function assertPublicHost(
  host: string,
  label: string
): Promise<string[]> {
  const hostname = host.trim().toLowerCase()

  if (!hostname || hostname.length > MAX_HOSTNAME_LENGTH) {
    throw new HostValidationError(`${label} server address is not valid.`)
  }

  // Bare IP literals are never accepted: there is no legitimate reason to
  // configure a mail account against one, and it removes a whole class of
  // bypass.
  if (isIP(hostname) !== 0) {
    throw new HostValidationError(
      `${label} server must be a hostname, not an IP address.`
    )
  }

  if (!HOSTNAME_PATTERN.test(hostname)) {
    throw new HostValidationError(`${label} server address is not valid.`)
  }

  let addresses: { address: string }[]
  try {
    addresses = await lookup(hostname, { all: true })
  } catch {
    throw new HostValidationError(
      `${label} server address could not be resolved.`
    )
  }

  if (!addresses.length) {
    throw new HostValidationError(
      `${label} server address could not be resolved.`
    )
  }

  for (const { address } of addresses) {
    if (isBlockedAddress(address)) {
      throw new HostValidationError(`${label} server address is not permitted.`)
    }
  }

  return addresses.map((a) => a.address)
}

export function assertAllowedPort(
  port: number,
  allowed: number[],
  label: string
): void {
  if (!Number.isInteger(port) || !allowed.includes(port)) {
    throw new HostValidationError(
      `${label} port must be one of: ${allowed.join(", ")}.`
    )
  }
}

/** Validates a full custom-connection endpoint pair. */
export async function assertValidMailEndpoints(input: {
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
}): Promise<void> {
  assertAllowedPort(input.imapPort, ALLOWED_IMAP_PORTS, "IMAP")
  assertAllowedPort(input.smtpPort, ALLOWED_SMTP_PORTS, "SMTP")
  await assertPublicHost(input.imapHost, "IMAP")
  await assertPublicHost(input.smtpHost, "SMTP")
}
