import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto"
import { env } from "../env"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

/**
 * Ciphertext envelope prefix. Everything written by `encrypt()` carries it so
 * that (a) values still stored in plaintext from before encryption-at-rest are
 * distinguishable from ciphertext, and (b) a future key rotation can introduce
 * "v2." alongside a decrypt path that still understands "v1.".
 */
const ENVELOPE_V1 = "v1."

let derivedKey: Buffer | null = null

function getKey(): Buffer {
  if (derivedKey) return derivedKey

  const raw = env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required for iCloud password encryption. Generate one with: openssl rand -hex 32"
    )
  }

  derivedKey = Buffer.from(
    hkdfSync("sha256", raw, "zeitmail-encryption", "aes-256-gcm-key", 32)
  )
  return derivedKey
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return ENVELOPE_V1 + Buffer.concat([iv, encrypted, authTag]).toString("base64")
}

/** True if `value` was produced by `encrypt()` (as opposed to a legacy plaintext row). */
export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENVELOPE_V1)
}

/**
 * Decrypts a value written by `encrypt()`. Values that predate
 * encryption-at-rest are returned unchanged so existing rows keep working;
 * a value that *claims* to be ciphertext but fails to decrypt throws rather
 * than silently degrading to the raw stored bytes.
 */
export function decryptSecret(value: string | null | undefined): string {
  if (!value) return ""
  if (!isEncrypted(value)) return value
  return decrypt(value)
}

export function decrypt(ciphertext: string): string {
  const key = getKey()
  const payload = ciphertext.startsWith(ENVELOPE_V1)
    ? ciphertext.slice(ENVELOPE_V1.length)
    : ciphertext
  const buf = Buffer.from(payload, "base64")

  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted payload")
  }

  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(buf.length - AUTH_TAG_LENGTH)
  const encrypted = buf.subarray(IV_LENGTH, buf.length - AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return decipher.update(encrypted) + decipher.final("utf8")
}
