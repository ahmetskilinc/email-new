/**
 * The validated-session snapshot the proxy forwards to the render path.
 *
 * The proxy is the only writer: it strips any inbound `x-zm-auth` header
 * before optionally setting its own, so a value read from `headers()` in a
 * server component is always proxy-authored. It carries identity for
 * first-paint rendering only — never a token, and never authorization:
 * every server action still validates the HttpOnly cookie itself.
 *
 * Isomorphic on purpose (no server imports): the client `SessionProvider`
 * shares the type, and encode/decode must agree byte-for-byte.
 */
export const AUTH_SNAPSHOT_HEADER = "x-zm-auth"

export type AuthSnapshot = {
  /** better-auth user id */
  uid: string
  email: string
  name: string
  image: string | null
  /** user.defaultConnectionId — seeds the active-connection query */
  dcid: string | null
  /** session expiry, epoch ms */
  sxp: number
}

const toBase64Url = (value: string) =>
  // btoa exists in Node >= 16 and every browser; the snapshot is ASCII-safe
  // only after URI-encoding, since names can contain arbitrary unicode.
  btoa(encodeURIComponent(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

const fromBase64Url = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=")
  return decodeURIComponent(atob(padded))
}

export function encodeAuthSnapshot(snapshot: AuthSnapshot): string {
  return toBase64Url(JSON.stringify(snapshot))
}

export function decodeAuthSnapshot(value: string | null): AuthSnapshot | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(fromBase64Url(value)) as Partial<AuthSnapshot>
    if (typeof parsed.uid !== "string" || typeof parsed.email !== "string") {
      return null
    }
    return {
      uid: parsed.uid,
      email: parsed.email,
      name: typeof parsed.name === "string" ? parsed.name : "",
      image: typeof parsed.image === "string" ? parsed.image : null,
      dcid: typeof parsed.dcid === "string" ? parsed.dcid : null,
      sxp: typeof parsed.sxp === "number" ? parsed.sxp : 0,
    }
  } catch {
    return null
  }
}
