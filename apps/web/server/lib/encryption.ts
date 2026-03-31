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

let derivedKey: Buffer | null = null

function getKey(): Buffer {
  if (derivedKey) return derivedKey

  const raw = env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required for iCloud password encryption. Generate one with: openssl rand -hex 32",
    )
  }

  derivedKey = Buffer.from(
    hkdfSync("sha256", raw, "zeitmail-encryption", "aes-256-gcm-key", 32),
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

  return Buffer.concat([iv, encrypted, authTag]).toString("base64")
}

export function decrypt(ciphertext: string): string {
  const key = getKey()
  const buf = Buffer.from(ciphertext, "base64")

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
