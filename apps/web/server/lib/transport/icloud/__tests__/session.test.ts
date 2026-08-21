import { describe, expect, test } from "bun:test"
import {
  buildSession,
  deserializeSession,
  dsidFromCookies,
  hasAuthCookies,
  mergeSetCookies,
  parseCookieHeader,
  parseSessionInput,
  redactSession,
  serializeCookies,
  serializeSession,
  ICloudSessionInputError,
} from "../session"

const TOKEN = "X-APPLE-WEBAUTH-TOKEN=abc123"
const USER = "X-APPLE-WEBAUTH-USER=v%3D1%3As%3D0%3Ad%3D1234567890"

describe("cookie jar", () => {
  test("parses and re-serializes a cookie header", () => {
    const jar = parseCookieHeader(`${TOKEN}; ${USER}`)
    expect(jar.get("X-APPLE-WEBAUTH-TOKEN")).toBe("abc123")
    expect(serializeCookies(jar)).toBe(`${TOKEN}; ${USER}`)
  })

  test("ignores malformed pairs rather than storing junk", () => {
    const jar = parseCookieHeader(`${TOKEN}; ; =orphan; novalue`)
    expect(Array.from(jar.keys())).toEqual(["X-APPLE-WEBAUTH-TOKEN"])
  })

  test("reads the dsid out of the webauth-user cookie", () => {
    expect(dsidFromCookies(parseCookieHeader(USER))).toBe("1234567890")
  })

  test("reports whether an auth cookie is present", () => {
    expect(hasAuthCookies(parseCookieHeader(USER))).toBe(false)
    expect(hasAuthCookies(parseCookieHeader(TOKEN))).toBe(true)
  })
})

describe("mergeSetCookies", () => {
  test("adds and replaces rotated cookies", () => {
    const jar = parseCookieHeader(TOKEN)
    const { changed } = mergeSetCookies(jar, [
      "X-APPLE-WEBAUTH-TOKEN=rotated; Path=/; Secure",
      "X-APPLE-WEBAUTH-HSA-TRUST=trusted; Path=/",
    ])
    expect(changed).toBe(true)
    expect(jar.get("X-APPLE-WEBAUTH-TOKEN")).toBe("rotated")
    expect(jar.get("X-APPLE-WEBAUTH-HSA-TRUST")).toBe("trusted")
  })

  test("reports no change when Apple resends the same values", () => {
    const jar = parseCookieHeader(TOKEN)
    const { changed } = mergeSetCookies(jar, ["X-APPLE-WEBAUTH-TOKEN=abc123"])
    expect(changed).toBe(false)
  })

  test("drops a cookie Apple expires instead of keeping a stale token", () => {
    const jar = parseCookieHeader(TOKEN)
    const { changed } = mergeSetCookies(jar, [
      "X-APPLE-WEBAUTH-TOKEN=abc123; Max-Age=0",
    ])
    expect(changed).toBe(true)
    expect(jar.has("X-APPLE-WEBAUTH-TOKEN")).toBe(false)
  })

  test("drops a cookie whose Expires is in the past", () => {
    const jar = parseCookieHeader(TOKEN)
    mergeSetCookies(jar, [
      "X-APPLE-WEBAUTH-TOKEN=abc123; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ])
    expect(jar.has("X-APPLE-WEBAUTH-TOKEN")).toBe(false)
  })
})

describe("parseSessionInput", () => {
  test("accepts a raw cookie header", () => {
    expect(parseSessionInput(`${TOKEN}; ${USER}`).cookies).toContain("abc123")
  })

  test("accepts a header still carrying its 'Cookie:' prefix", () => {
    expect(parseSessionInput(`Cookie: ${TOKEN}`).cookies).toBe(TOKEN)
  })

  test("accepts a JSON object with a cookies field", () => {
    const parsed = parseSessionInput(
      JSON.stringify({ cookies: `${TOKEN}; ${USER}`, dsid: "999" })
    )
    expect(parsed.dsid).toBe("999")
    expect(parsed.cookies).toContain("abc123")
  })

  test("accepts a devtools-style cookie array", () => {
    const parsed = parseSessionInput(
      JSON.stringify([
        { name: "X-APPLE-WEBAUTH-TOKEN", value: "abc123" },
        { name: "other", value: "x" },
      ])
    )
    expect(parsed.cookies).toContain("X-APPLE-WEBAUTH-TOKEN=abc123")
  })

  test("rejects a cookie header with no iCloud auth token", () => {
    expect(() => parseSessionInput("session=nope; other=1")).toThrow(
      ICloudSessionInputError
    )
  })

  test("rejects empty input", () => {
    expect(() => parseSessionInput("   ")).toThrow(ICloudSessionInputError)
  })

  test("rejects JSON it cannot parse rather than half-reading it", () => {
    expect(() => parseSessionInput('{"cookies": ')).toThrow(
      ICloudSessionInputError
    )
  })
})

describe("session round-trip", () => {
  test("fills in dsid and defaults, and survives serialization", () => {
    const session = buildSession(parseSessionInput(`${TOKEN}; ${USER}`))
    expect(session.dsid).toBe("1234567890")
    expect(session.clientId).toBeTruthy()
    expect(session.clientBuildNumber).toBeTruthy()

    const restored = deserializeSession(serializeSession(session))
    expect(restored).toEqual(session)
  })

  test("refuses a stored session with no cookies", () => {
    expect(() => deserializeSession(JSON.stringify({ dsid: "1" }))).toThrow(
      ICloudSessionInputError
    )
  })
})

describe("redactSession", () => {
  test("never exposes a cookie value", () => {
    const session = buildSession(parseSessionInput(`${TOKEN}; ${USER}`))
    const redacted = JSON.stringify(redactSession(session))
    expect(redacted).not.toContain("abc123")
    expect(redacted).not.toContain(session.cookies)
    expect(redacted).toContain("X-APPLE-WEBAUTH-TOKEN")
  })

  test("does not expose the full dsid", () => {
    const session = buildSession(parseSessionInput(`${TOKEN}; ${USER}`))
    expect(JSON.stringify(redactSession(session))).not.toContain("1234567890")
  })
})
