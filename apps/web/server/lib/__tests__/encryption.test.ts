import { beforeAll, describe, expect, test } from "bun:test"

process.env.ENCRYPTION_KEY ??=
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

let encrypt: typeof import("../encryption").encrypt
let decrypt: typeof import("../encryption").decrypt
let decryptSecret: typeof import("../encryption").decryptSecret
let isEncrypted: typeof import("../encryption").isEncrypted

beforeAll(async () => {
  ;({ encrypt, decrypt, decryptSecret, isEncrypted } =
    await import("../encryption"))
})

describe("encryption", () => {
  test("round-trips a value", () => {
    const secret = "app-specific-password-123"
    expect(decrypt(encrypt(secret))).toBe(secret)
  })

  test("produces a distinct ciphertext each time (random IV)", () => {
    const a = encrypt("same input")
    const b = encrypt("same input")
    expect(a).not.toBe(b)
    expect(decrypt(a)).toBe(decrypt(b))
  })

  test("tags ciphertext with the version envelope", () => {
    expect(isEncrypted(encrypt("x"))).toBe(true)
    expect(isEncrypted("plaintext-legacy-token")).toBe(false)
    expect(isEncrypted(null)).toBe(false)
  })

  // GCM: tampering must fail closed rather than return altered plaintext.
  test("rejects a tampered ciphertext", () => {
    const encrypted = encrypt("sensitive")
    const raw = encrypted.slice("v1.".length)
    const bytes = Buffer.from(raw, "base64")
    // Flip a bit in the auth tag.
    bytes.writeUInt8(bytes.readUInt8(bytes.length - 1) ^ 0xff, bytes.length - 1)
    const tampered = "v1." + bytes.toString("base64")
    expect(() => decrypt(tampered)).toThrow()
  })

  test("rejects a truncated payload", () => {
    expect(() =>
      decrypt("v1." + Buffer.from("short").toString("base64"))
    ).toThrow()
  })

  describe("decryptSecret", () => {
    test("passes legacy plaintext through unchanged", () => {
      // Rows written before encryption-at-rest must keep working.
      expect(decryptSecret("ya29.legacy-plaintext-token")).toBe(
        "ya29.legacy-plaintext-token"
      )
    })

    test("decrypts enveloped values", () => {
      expect(decryptSecret(encrypt("refresh-token"))).toBe("refresh-token")
    })

    test("throws rather than returning ciphertext when decryption fails", () => {
      // The old resolveAccessToken swallowed this and returned the ciphertext,
      // which was then sent to a mail server as the account password.
      expect(() =>
        decryptSecret("v1." + Buffer.from("garbage").toString("base64"))
      ).toThrow()
    })

    test("treats empty input as empty", () => {
      expect(decryptSecret(null)).toBe("")
      expect(decryptSecret("")).toBe("")
    })
  })
})
