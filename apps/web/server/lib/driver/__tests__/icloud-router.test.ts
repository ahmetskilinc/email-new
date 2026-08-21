import { describe, expect, test } from "bun:test"
import { ICloudMailManager } from "../icloud"
import { ICloudUnsupportedOperationError } from "../../transport/icloud/errors"
import type { ICloudWebSession } from "../../transport/icloud/session"
import type { ManagerConfig } from "../types"

const webSession: ICloudWebSession = {
  cookies: "X-APPLE-WEBAUTH-TOKEN=abc123",
  dsid: "1234567890",
  clientId: "CLIENT-ID",
  clientBuildNumber: "2413Project37",
  clientMasteringNumber: "2413B32",
  mailServiceUrl: "https://p05-mailws.icloud.com",
  capturedAt: new Date(0).toISOString(),
}

const config = (overrides: Partial<ManagerConfig> = {}): ManagerConfig => ({
  auth: {
    userId: "user-1",
    accessToken: "",
    refreshToken: "",
    email: "someone@icloud.com",
  },
  ...overrides,
})

describe("ICloudMailManager routing", () => {
  test("uses the web service when the connection carries a session", () => {
    const manager = new ICloudMailManager(
      config({ icloud: { session: webSession } })
    )
    expect(manager.usesWebService).toBe(true)
    expect(manager.getScope()).toBe("icloud")
  })

  test("stays on IMAP when only an app-specific password is stored", () => {
    const manager = new ICloudMailManager(
      config({ auth: { ...config().auth, accessToken: "app-password" } })
    )
    expect(manager.usesWebService).toBe(false)
  })

  test("refuses a connection with neither credential", () => {
    expect(() => new ICloudMailManager(config())).toThrow(
      /neither an iCloud session nor an app-specific password/
    )
  })

  test("reports sending as unsupported when there is no password to fall back to", async () => {
    const manager = new ICloudMailManager(
      config({ icloud: { session: webSession } })
    )
    await expect(
      manager.create({
        to: [{ email: "you@icloud.com" }],
        subject: "hi",
        message: "hello",
        attachments: [],
        headers: {},
      })
    ).rejects.toBeInstanceOf(ICloudUnsupportedOperationError)
  })

  test("the unsupported-send message tells the user what to do about it", async () => {
    const manager = new ICloudMailManager(
      config({ icloud: { session: webSession } })
    )
    await expect(
      manager.createDraft({
        to: "you@icloud.com",
        subject: "hi",
        message: "hello",
        id: null,
        threadId: null,
        fromEmail: null,
      })
    ).rejects.toThrow(/app-specific password/)
  })
})
