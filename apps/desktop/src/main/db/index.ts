import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { app } from "electron"
import { join } from "node:path"
import * as schema from "./schema"
import { migrations } from "./migrations"

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _sqlite: InstanceType<typeof Database> | null = null

export function initDatabase(): void {
  const dbPath = join(app.getPath("userData"), "zeitmail.db")
  _sqlite = new Database(dbPath)
  _sqlite.pragma("journal_mode = WAL")
  _sqlite.pragma("foreign_keys = ON")
  _db = drizzle(_sqlite, { schema })
}

/**
 * Apply SQL migrations inlined via vite `?raw` imports. Statements within a
 * file are separated by drizzle-kit's `--> statement-breakpoint` marker.
 *
 * All migration DDL is written with `IF NOT EXISTS` guards so this runs
 * idempotently on every startup without tracking applied migrations in a
 * separate bookkeeping table. Future schema changes should add new migration
 * files and bump `migrations/index.ts`.
 */
export async function runMigrations(): Promise<void> {
  if (!_sqlite) throw new Error("Database not initialized")

  for (const migration of migrations) {
    const statements = migration.sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    try {
      _sqlite.exec("BEGIN")
      for (const stmt of statements) {
        _sqlite.exec(stmt)
      }
      _sqlite.exec("COMMIT")
    } catch (err) {
      _sqlite.exec("ROLLBACK")
      console.error(`[db] migration ${migration.name} failed:`, err)
      throw err
    }
  }

  console.log(`[db] applied ${migrations.length} migration(s)`)
}

export function getDb() {
  if (!_db) throw new Error("Database not initialized")
  return _db
}

export function getSqlite() {
  if (!_sqlite) throw new Error("Database not initialized")
  return _sqlite
}

export type DB = ReturnType<typeof getDb>
