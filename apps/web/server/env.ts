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

const requireEnv = (key: keyof AppEnv, fallback = ""): string =>
  process.env[key] ?? fallback

export const env: AppEnv = {
  NODE_ENV: (process.env.NODE_ENV as AppEnv["NODE_ENV"]) || "development",
  DATABASE_URL: requireEnv("DATABASE_URL"),
  BETTER_AUTH_SECRET: requireEnv("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: requireEnv("BETTER_AUTH_URL"),
  BETTER_AUTH_TRUSTED_ORIGINS: requireEnv("BETTER_AUTH_TRUSTED_ORIGINS"),
  GOOGLE_CLIENT_ID: requireEnv("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: requireEnv("GOOGLE_CLIENT_SECRET"),
  MICROSOFT_CLIENT_ID: requireEnv("MICROSOFT_CLIENT_ID"),
  MICROSOFT_CLIENT_SECRET: requireEnv("MICROSOFT_CLIENT_SECRET"),
  IMAP_SERVICE_URL: requireEnv("IMAP_SERVICE_URL", "http://localhost:8789"),
  ENCRYPTION_KEY: requireEnv("ENCRYPTION_KEY"),
}
