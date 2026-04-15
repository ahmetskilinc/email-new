/**
 * Inlines migration SQL at build time so the main bundle doesn't need to
 * locate .sql files on disk after packaging. Order matters — keep the array
 * sorted by migration filename.
 */
import initialSql from "./0000_initial.sql?raw"

export interface Migration {
  name: string
  sql: string
}

export const migrations: Migration[] = [
  { name: "0000_initial", sql: initialSql as string },
]
