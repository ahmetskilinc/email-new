import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { app } from "electron"
import { join } from "path"
import * as schema from "./schema"

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null
let _sqlite: InstanceType<typeof Database> | null = null

export function initDatabase(): void {
  const dbPath = join(app.getPath("userData"), "zeitmail.db")
  _sqlite = new Database(dbPath)
  _sqlite.pragma("journal_mode = WAL")
  _sqlite.pragma("foreign_keys = ON")
  _db = drizzle(_sqlite, { schema })
}

export async function runMigrations(): Promise<void> {
  // Migrations will be run via drizzle-kit at build time
  // For now, push schema directly in dev
  if (!_sqlite) throw new Error("Database not initialized")
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
