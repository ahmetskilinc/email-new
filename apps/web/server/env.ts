import { resolve } from "node:path"
import { config } from "dotenv"

config({ path: resolve(process.cwd(), "../../.env"), override: false })

export type AppEnv = {
  NODE_ENV: "development" | "production" | "test"
  DATABASE_URL: string
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  BETTER_AUTH_TRUSTED_ORIGINS: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  MICROSOFT_CLIENT_ID: string
  MICROSOFT_CLIENT_SECRET: string
  IMAP_SERVICE_URL: string
  ENCRYPTION_KEY: string
}

/**
 * Variables the app must not start without. BETTER_AUTH_SECRET signs session
 * cookies and ENCRYPTION_KEY protects stored mailbox credentials; defaulting
 * either to "" meant a misconfigured deploy came up looking healthy while
 * signing sessions with an empty key.
 */
const REQUIRED_IN_PRODUCTION: (keyof AppEnv)[] = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "ENCRYPTION_KEY",
]

const readEnv = (key: keyof AppEnv, fallback = ""): string => {
  const value = process.env[key]
  if (value) return value

  if (
    REQUIRED_IN_PRODUCTION.includes(key) &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      `Missing required environment variable ${key}. Refusing to start.`
    )
  }

  return fallback
}

function resolveAppURL(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

export const env: AppEnv = {
  NODE_ENV: (process.env.NODE_ENV as AppEnv["NODE_ENV"]) || "development",
  DATABASE_URL: readEnv("DATABASE_URL"),
  BETTER_AUTH_SECRET: readEnv("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: resolveAppURL(),
  BETTER_AUTH_TRUSTED_ORIGINS: readEnv("BETTER_AUTH_TRUSTED_ORIGINS"),
  GOOGLE_CLIENT_ID: readEnv("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: readEnv("GOOGLE_CLIENT_SECRET"),
  MICROSOFT_CLIENT_ID: readEnv("MICROSOFT_CLIENT_ID"),
  MICROSOFT_CLIENT_SECRET: readEnv("MICROSOFT_CLIENT_SECRET"),
  IMAP_SERVICE_URL: readEnv("IMAP_SERVICE_URL", "http://localhost:8789"),
  ENCRYPTION_KEY: readEnv("ENCRYPTION_KEY"),
}
