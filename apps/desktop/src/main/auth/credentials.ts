import { safeStorage } from "electron"

// Prefix applied to every encrypted value so we can tell a ciphertext row
// apart from a plaintext legacy row when decrypting. Anything without this
// prefix is returned as-is (it was written before encryption was introduced).
const ENC_PREFIX = "enc:v1:"

/**
 * Encrypt a string using Electron's safeStorage API. Returns a prefixed
 * base64 string. Falls back to plain base64 if safeStorage is not available
 * (e.g. on some Linux setups without a secret-service backend) so the app
 * still functions.
 */
export function encrypt(text: string): string {
  if (!text) return text
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(text)
    return ENC_PREFIX + encrypted.toString("base64")
  }
  return ENC_PREFIX + Buffer.from(text, "utf-8").toString("base64")
}

/**
 * Decrypt a string previously produced by `encrypt()`. Plaintext inputs
 * (no ENC prefix) are passed through unchanged, which keeps existing
 * plaintext rows working across upgrades.
 */
export function decrypt(value: string): string {
  if (!value) return value
  if (!value.startsWith(ENC_PREFIX)) return value

  const payload = value.slice(ENC_PREFIX.length)
  if (safeStorage.isEncryptionAvailable()) {
    try {
      const buffer = Buffer.from(payload, "base64")
      return safeStorage.decryptString(buffer)
    } catch (err) {
      console.warn("[credentials] decryptString failed; treating as plaintext:", err)
      return Buffer.from(payload, "base64").toString("utf-8")
    }
  }
  return Buffer.from(payload, "base64").toString("utf-8")
}

/** Nullable-safe variants — handy when pulling from Drizzle columns. */
export function encryptNullable(v: string | null | undefined): string | null {
  if (v == null || v === "") return null
  return encrypt(v)
}

export function decryptNullable(v: string | null | undefined): string | null {
  if (v == null || v === "") return null
  return decrypt(v)
}
