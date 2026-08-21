import { describe, expect, test } from "bun:test"
import { ICloudWebServiceClient } from "../client"
import {
  ICloudProtocolError,
  ICloudReauthRequiredError,
  ICloudWebServiceError,
} from "../errors"
import type { ICloudWebSession } from "../session"

const session = (
  overrides: Partial<ICloudWebSession> = {}
): ICloudWebSession => ({
  cookies: "X-APPLE-WEBAUTH-TOKEN=abc123",
  dsid: "1234567890",
  clientId: "CLIENT-ID",
  clientBuildNumber: "2413Project37",
  clientMasteringNumber: "2413B32",
  mailServiceUrl: "https://p05-mailws.icloud.com",
  capturedAt: new Date(0).toISOString(),
  ...overrides,
})

type Call = { url: string; init: RequestInit }

function stubFetch(responder: (call: Call) => Response): {
  fetchImpl: typeof fetch
  calls: Call[]
} {
  const calls: Call[] = []
  const fetchImpl = (async (input: string, init: RequestInit) => {
    const call = { url: String(input), init }
    calls.push(call)
    return responder(call)
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), init)

describe("ICloudWebServiceClient.call", () => {
  test("sends the identifying query triple and the session cookie", async () => {
    const { fetchImpl, calls } = stubFetch(() => json({ folders: [] }))
    const client = new ICloudWebServiceClient({ session: session(), fetchImpl })

    await client.call("/wm/folder", { method: "list" })

    const url = new URL(calls[0]!.url)
    expect(url.origin).toBe("https://p05-mailws.icloud.com")
    expect(url.pathname).toBe("/wm/folder")
    expect(url.searchParams.get("dsid")).toBe("1234567890")
    expect(url.searchParams.get("clientId")).toBe("CLIENT-ID")
    expect(url.searchParams.get("clientBuildNumber")).toBe("2413Project37")

    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers.Cookie).toBe("X-APPLE-WEBAUTH-TOKEN=abc123")
    expect(headers.Origin).toBe("https://www.icloud.com")
    expect(calls[0]!.init.body).toBe(JSON.stringify({ method: "list" }))
  })

  test("discovers the mail shard when the session has no URL yet", async () => {
    const { fetchImpl, calls } = stubFetch((call) =>
      call.url.includes("setup.icloud.com")
        ? json({
            dsInfo: { dsid: "1234567890", primaryEmail: "a@icloud.com" },
            webservices: {
              mail: {
                url: "https://p33-mailws.icloud.com:443",
                status: "active",
              },
            },
          })
        : json({ folders: [] })
    )
    const client = new ICloudWebServiceClient({
      session: session({ mailServiceUrl: undefined }),
      fetchImpl,
    })

    await client.call("/wm/folder", {})

    expect(calls[0]!.url).toContain("setup.icloud.com/setup/ws/1/validate")
    expect(calls[1]!.url).toContain("https://p33-mailws.icloud.com/wm/folder")
  })

  test("discovers once and reuses the result", async () => {
    const { fetchImpl, calls } = stubFetch((call) =>
      call.url.includes("setup.icloud.com")
        ? json({
            dsInfo: { dsid: "1", primaryEmail: "a@icloud.com" },
            webservices: {
              mail: { url: "https://p33-mailws.icloud.com", status: "active" },
            },
          })
        : json({ folders: [] })
    )
    const client = new ICloudWebServiceClient({
      session: session({ mailServiceUrl: undefined }),
      fetchImpl,
    })

    await client.call("/wm/folder", {})
    await client.call("/wm/message", {})

    expect(
      calls.filter((c) => c.url.includes("setup.icloud.com"))
    ).toHaveLength(1)
  })

  test("treats an auth failure as a reauth signal, not a transport error", async () => {
    for (const status of [401, 403, 421, 450]) {
      const { fetchImpl } = stubFetch(() => new Response("", { status }))
      const client = new ICloudWebServiceClient({
        session: session(),
        fetchImpl,
      })
      await expect(client.call("/wm/folder", {})).rejects.toBeInstanceOf(
        ICloudReauthRequiredError
      )
    }
  })

  test("treats a missing endpoint as a protocol change", async () => {
    const { fetchImpl } = stubFetch(() => new Response("", { status: 404 }))
    const client = new ICloudWebServiceClient({ session: session(), fetchImpl })
    await expect(client.call("/wm/folder", {})).rejects.toBeInstanceOf(
      ICloudProtocolError
    )
  })

  test("treats a non-JSON body as a protocol change", async () => {
    const { fetchImpl } = stubFetch(() => new Response("<html>nope</html>"))
    const client = new ICloudWebServiceClient({ session: session(), fetchImpl })
    await expect(client.call("/wm/folder", {})).rejects.toBeInstanceOf(
      ICloudProtocolError
    )
  })

  test("reports any other status as a service error", async () => {
    const { fetchImpl } = stubFetch(() => new Response("", { status: 500 }))
    const client = new ICloudWebServiceClient({ session: session(), fetchImpl })
    await expect(client.call("/wm/folder", {})).rejects.toBeInstanceOf(
      ICloudWebServiceError
    )
  })

  test("wraps a network failure rather than leaking it", async () => {
    const fetchImpl = (async () => {
      throw new Error("getaddrinfo ENOTFOUND p05-mailws.icloud.com")
    }) as unknown as typeof fetch
    const client = new ICloudWebServiceClient({ session: session(), fetchImpl })
    await expect(client.call("/wm/folder", {})).rejects.toBeInstanceOf(
      ICloudWebServiceError
    )
  })

  test("persists cookies Apple rotates mid-flight", async () => {
    const { fetchImpl } = stubFetch(() =>
      json(
        { folders: [] },
        { headers: { "set-cookie": "X-APPLE-WEBAUTH-TOKEN=rotated; Path=/" } }
      )
    )
    const persisted: string[] = []
    const client = new ICloudWebServiceClient({
      session: session(),
      fetchImpl,
      onSessionUpdate: (updated) => {
        persisted.push(updated.cookies)
      },
    })

    await client.call("/wm/folder", {})

    expect(persisted).toEqual(["X-APPLE-WEBAUTH-TOKEN=rotated"])
    expect(client.getSession().cookies).toBe("X-APPLE-WEBAUTH-TOKEN=rotated")
  })

  test("does not persist when Apple resends the same cookies", async () => {
    const { fetchImpl } = stubFetch(() =>
      json(
        { folders: [] },
        { headers: { "set-cookie": "X-APPLE-WEBAUTH-TOKEN=abc123" } }
      )
    )
    let persistCount = 0
    const client = new ICloudWebServiceClient({
      session: session(),
      fetchImpl,
      onSessionUpdate: () => {
        persistCount += 1
      },
    })

    await client.call("/wm/folder", {})
    expect(persistCount).toBe(0)
  })

  test("a failing persist callback does not fail the request", async () => {
    const { fetchImpl } = stubFetch(() =>
      json(
        { folders: [] },
        { headers: { "set-cookie": "X-APPLE-WEBAUTH-TOKEN=rotated" } }
      )
    )
    const client = new ICloudWebServiceClient({
      session: session(),
      fetchImpl,
      onSessionUpdate: () => {
        throw new Error("database is down")
      },
    })

    await expect(client.call("/wm/folder", {})).resolves.toBeDefined()
  })

  test("refuses a mail service URL that points off icloud.com", async () => {
    const { fetchImpl } = stubFetch(() => json({ folders: [] }))
    const client = new ICloudWebServiceClient({
      session: session({ mailServiceUrl: "https://attacker.example" }),
      fetchImpl,
    })
    await expect(client.call("/wm/folder", {})).rejects.toBeInstanceOf(
      ICloudProtocolError
    )
  })

  test("describe() never exposes the credential", () => {
    const client = new ICloudWebServiceClient({ session: session() })
    expect(JSON.stringify(client.describe())).not.toContain("abc123")
  })
})
