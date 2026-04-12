import { safeStorage } from "electron"

/**
 * Encrypt a string using Electron's safeStorage API.
 * Returns a base64-encoded string. Falls back to a plain base64 encoding
 * if safeStorage is not available (e.g. in development on some Linux distros).
 */
export function encrypt(text: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(text)
    return encrypted.toString("base64")
  }
  // Fallback: base64 encode (not secure, but allows the app to function)
  return Buffer.from(text, "utf-8").toString("base64")
}

/**
 * Decrypt a base64-encoded string that was encrypted with `encrypt()`.
 * Falls back to plain base64 decoding if safeStorage is not available.
 */
export function decrypt(b64: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    const buffer = Buffer.from(b64, "base64")
    return safeStorage.decryptString(buffer)
  }
  // Fallback: base64 decode
  return Buffer.from(b64, "base64").toString("utf-8")
}
