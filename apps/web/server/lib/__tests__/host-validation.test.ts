import { describe, expect, test } from "bun:test"
import {
  ALLOWED_IMAP_PORTS,
  ALLOWED_SMTP_PORTS,
  HostValidationError,
  assertAllowedPort,
  assertPublicHost,
  isBlockedAddress,
} from "../transport/host-validation"

/**
 * These guard the SSRF boundary on custom connections: a signed-up user names
 * the host and port the server connects to.
 */
describe("isBlockedAddress", () => {
  test.each([
    ["127.0.0.1", "loopback"],
    ["10.1.2.3", "private /8"],
    ["172.16.5.5", "private /12 lower bound"],
    ["172.31.255.255", "private /12 upper bound"],
    ["192.168.1.1", "private /16"],
    ["169.254.169.254", "cloud metadata"],
    ["100.64.0.1", "CGNAT"],
    ["0.0.0.0", "this network"],
    ["192.0.0.1", "IETF protocol assignments"],
    ["198.18.0.1", "benchmarking"],
    ["224.0.0.1", "multicast"],
    ["240.0.0.1", "reserved"],
    ["::1", "IPv6 loopback"],
    ["::", "IPv6 unspecified"],
    ["fd00::1", "IPv6 unique local"],
    ["fe80::1", "IPv6 link-local"],
    ["::ffff:127.0.0.1", "IPv4-mapped loopback"],
  ])("blocks %s (%s)", (address) => {
    expect(isBlockedAddress(address)).toBe(true)
  })

  // Regression: `&` returns a signed int32, so without coercing both sides back
  // to unsigned every range whose first octet is >= 128 silently failed to match.
  test.each([
    ["8.8.8.8"],
    ["1.1.1.1"],
    ["93.184.216.34"],
    ["172.15.0.1"], // just below the private /12
    ["172.32.0.1"], // just above the private /12
    ["100.63.255.255"], // just below CGNAT
    ["199.18.0.1"], // just above benchmarking
    ["2606:4700::1111"],
  ])("allows public address %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false)
  })

  test("blocks anything that is not an IP address", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true)
    expect(isBlockedAddress("")).toBe(true)
  })
})

describe("assertAllowedPort", () => {
  test("accepts the mail ports", () => {
    for (const port of ALLOWED_IMAP_PORTS) {
      expect(() =>
        assertAllowedPort(port, ALLOWED_IMAP_PORTS, "IMAP")
      ).not.toThrow()
    }
    for (const port of ALLOWED_SMTP_PORTS) {
      expect(() =>
        assertAllowedPort(port, ALLOWED_SMTP_PORTS, "SMTP")
      ).not.toThrow()
    }
  })

  test.each([6379, 22, 80, 3306, 0, -1, 1.5, 65536])(
    "rejects port %p",
    (port) => {
      expect(() => assertAllowedPort(port, ALLOWED_IMAP_PORTS, "IMAP")).toThrow(
        HostValidationError
      )
    }
  )
})

describe("assertPublicHost", () => {
  test.each([
    ["127.0.0.1", "bare IPv4 literal"],
    ["169.254.169.254", "metadata IP literal"],
    ["[::1]", "bracketed IPv6"],
    ["localhost", "single label"],
    ["", "empty"],
    ["a".repeat(300), "over length"],
    ["exa mple.com", "space"],
    ["exam_ple.com", "underscore"],
  ])("rejects %s (%s)", async (host) => {
    await expect(assertPublicHost(host, "IMAP")).rejects.toThrow(
      HostValidationError
    )
  })

  test("rejects a hostname that does not resolve", async () => {
    await expect(
      assertPublicHost("nonexistent.invalid", "IMAP")
    ).rejects.toThrow(HostValidationError)
  })
})
