/**
 * Applies pending drizzle migrations (server/db/migrations) before the build.
 *
 * Runs only for production builds (or with RUN_MIGRATIONS=1), so preview
 * builds never touch the database. Migrations are the source of truth for
 * schema changes now — `db:push` remains for local scratch work only; the
 * schema-drift outage of 2026-08-28 (code deployed reading columns prod
 * never had) is exactly what this step prevents.
 *
 * Workflow for a schema change:
 *   1. edit server/db/schema.ts
 *   2. bun run db:generate      (writes a new migration file — commit it)
 *   3. bun run db:migrate       (applies locally)
 *   4. deploy — this script applies it to production during the build
 */
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

const isProductionBuild = process.env.VERCEL_ENV === "production"
const forced = process.env.RUN_MIGRATIONS === "1"

if (!isProductionBuild && !forced) {
  console.log(
    `[migrate] skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? "<unset>"}; set RUN_MIGRATIONS=1 to force)`
  )
  process.exit(0)
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error("[migrate] DATABASE_URL is not set")
  process.exit(1)
}

// Same TLS posture as server/db/index.ts: explicit ssl/sslmode in the URL
// wins; otherwise require TLS only against the production database (the
// local Docker Postgres speaks cleartext).
const hasExplicitSsl = /[?&](sslmode|ssl)=/i.test(url)
const requireSsl = !hasExplicitSsl && isProductionBuild
const client = postgres(url, {
  max: 1,
  // "already exists, skipping" notices from the migrations-table bootstrap
  // are expected on every run; keep build logs signal-only.
  onnotice: () => {},
  ...(requireSsl ? { ssl: "require" } : {}),
})

try {
  await migrate(drizzle(client), { migrationsFolder: "./server/db/migrations" })
  console.log("[migrate] migrations applied")
} catch (error) {
  console.error("[migrate] failed:", error)
  process.exit(1)
} finally {
  await client.end()
}
