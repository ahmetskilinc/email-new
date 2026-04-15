import { app } from "electron"
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

/**
 * Minimal .env parser — no external dependency.
 * Supports KEY=VALUE lines, # comments, blank lines, and single/double-quoted
 * values. Does not evaluate ${…} interpolation.
 */
function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (!key) continue
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function applyEnv(entries: Record<string, string>): void {
  for (const [key, value] of Object.entries(entries)) {
    // Respect variables already set in the real environment.
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value
    }
  }
}

/**
 * Candidate .env file locations, in priority order:
 * 1. userData/.env        — preferred in packaged builds
 * 2. repo root .env       — dev convenience (electron-vite dev)
 * 3. cwd/.env             — fallback
 */
function candidatePaths(): string[] {
  const paths: string[] = []

  try {
    paths.push(join(app.getPath("userData"), ".env"))
  } catch {
    // app not ready yet — skip userData
  }

  // Walk up from __dirname to find a repo-root .env during dev.
  // __dirname in dev points into out/main or similar, so we climb up to 5 levels.
  let dir = resolve(__dirname)
  for (let i = 0; i < 6; i++) {
    paths.push(join(dir, ".env"))
    const parent = resolve(dir, "..")
    if (parent === dir) break
    dir = parent
  }

  paths.push(join(process.cwd(), ".env"))
  return paths
}

let loaded = false

/**
 * Load the first existing .env file into process.env.
 * Idempotent — safe to call more than once.
 */
export function loadEnv(): void {
  if (loaded) return
  loaded = true

  for (const path of candidatePaths()) {
    if (existsSync(path)) {
      try {
        const contents = readFileSync(path, "utf-8")
        applyEnv(parseEnvFile(contents))
        // eslint-disable-next-line no-console
        console.log(`[env] loaded ${path}`)
        return
      } catch (err) {
        console.warn(`[env] failed to read ${path}:`, err)
      }
    }
  }
  console.log("[env] no .env file found; relying on process.env")
}

export interface OAuthProviderConfig {
  clientId: string
  clientSecret: string
}

export interface OAuthConfig {
  google: OAuthProviderConfig | null
  microsoft: OAuthProviderConfig | null
}

/**
 * Read OAuth client credentials from the environment. Returns `null` for a
 * provider whose id or secret is missing so the UI can show a clear error.
 *
 * Desktop-specific vars (GOOGLE_DESKTOP_CLIENT_ID / _SECRET, likewise for
 * Microsoft) take precedence over the generic ones. This lets the same repo
 * support both the web app (using GOOGLE_CLIENT_ID with a Web OAuth client)
 * and the desktop app (which requires a Desktop OAuth client because it
 * uses the loopback redirect flow — web clients can't list random ports).
 */
export function getOAuthConfig(): OAuthConfig {
  const googleId =
    process.env.GOOGLE_DESKTOP_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
  const googleSecret =
    process.env.GOOGLE_DESKTOP_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET
  const msId =
    process.env.MICROSOFT_DESKTOP_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
  const msSecret =
    process.env.MICROSOFT_DESKTOP_CLIENT_SECRET ||
    process.env.MICROSOFT_CLIENT_SECRET

  return {
    google:
      googleId && googleSecret
        ? { clientId: googleId, clientSecret: googleSecret }
        : null,
    microsoft:
      msId && msSecret
        ? { clientId: msId, clientSecret: msSecret }
        : null,
  }
}
