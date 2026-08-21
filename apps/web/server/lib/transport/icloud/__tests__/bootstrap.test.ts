import { describe, expect, test } from "bun:test"
import { assertIcloudServiceUrl, readBootstrap } from "../bootstrap"
import { ICloudProtocolError } from "../errors"

const VALID = {
  dsInfo: {
    dsid: "1234567890",
    primaryEmail: "someone@icloud.com",
    fullName: "Some One",
  },
  webservices: {
    mail: { url: "https://p05-mailws.icloud.com:443", status: "active" },
  },
}

describe("assertIcloudServiceUrl", () => {
  test("accepts an https icloud.com shard", () => {
    expect(
      assertIcloudServiceUrl("https://p05-mailws.icloud.com:443").hostname
    ).toBe("p05-mailws.icloud.com")
  })

  test("rejects a non-icloud host", () => {
    expect(() =>
      assertIcloudServiceUrl("https://p05-mailws.evil.example")
    ).toThrow(ICloudProtocolError)
  })

  test("rejects a host that only suffixes as icloud.com", () => {
    expect(() =>
      assertIcloudServiceUrl("https://mailws.icloud.com.evil.example")
    ).toThrow(ICloudProtocolError)
  })

  test("rejects plaintext http", () => {
    expect(() =>
      assertIcloudServiceUrl("http://p05-mailws.icloud.com")
    ).toThrow(ICloudProtocolError)
  })

  test("rejects a non-URL", () => {
    expect(() => assertIcloudServiceUrl("p05-mailws")).toThrow(
      ICloudProtocolError
    )
  })
})

describe("readBootstrap", () => {
  test("reads dsid, mail URL and identity", () => {
    const result = readBootstrap(VALID)
    expect(result.dsid).toBe("1234567890")
    expect(result.mailServiceUrl).toBe("https://p05-mailws.icloud.com")
    expect(result.primaryEmail).toBe("someone@icloud.com")
    expect(result.fullName).toBe("Some One")
  })

  test("builds a name from first/last when fullName is absent", () => {
    const result = readBootstrap({
      ...VALID,
      dsInfo: {
        dsid: "1",
        primaryEmail: "a@icloud.com",
        firstName: "Ada",
        lastName: "Lovelace",
      },
    })
    expect(result.fullName).toBe("Ada Lovelace")
  })

  test("accepts a numeric dsid", () => {
    expect(
      readBootstrap({ ...VALID, dsInfo: { ...VALID.dsInfo, dsid: 42 } }).dsid
    ).toBe("42")
  })

  test("rejects an account with no mail web service", () => {
    expect(() =>
      readBootstrap({ ...VALID, webservices: { drive: { url: "x" } } })
    ).toThrow(ICloudProtocolError)
  })

  test("rejects a mail service Apple reports as inactive", () => {
    expect(() =>
      readBootstrap({
        ...VALID,
        webservices: {
          mail: { url: "https://p05-mailws.icloud.com", status: "inactive" },
        },
      })
    ).toThrow(ICloudProtocolError)
  })

  test("rejects a payload with no dsid", () => {
    expect(() =>
      readBootstrap({ ...VALID, dsInfo: { primaryEmail: "a@icloud.com" } })
    ).toThrow(ICloudProtocolError)
  })

  test("rejects an empty payload", () => {
    expect(() => readBootstrap(null)).toThrow(ICloudProtocolError)
  })

  test("refuses a mail service URL pointing off icloud.com", () => {
    expect(() =>
      readBootstrap({
        ...VALID,
        webservices: {
          mail: { url: "https://attacker.example/wm", status: "active" },
        },
      })
    ).toThrow(ICloudProtocolError)
  })
})
