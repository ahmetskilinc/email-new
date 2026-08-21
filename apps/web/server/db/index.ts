import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"
import { env } from "../env"

const createDrizzle = (conn: postgres.Sql) => drizzle(conn, { schema })

/**
 * postgres-js talks cleartext unless told otherwise, and every query here
 * carries connection secrets, so require TLS in production. A connection
 * string that already states its own ssl/sslmode wins — that is the operator
 * being explicit (including deliberately disabling it for a local socket).
 */
const sslOption = (url: string) => {
  const hasExplicitSsl = /[?&](sslmode|ssl)=/i.test(url)
  if (hasExplicitSsl) return undefined
  return process.env.NODE_ENV === "production" ? "require" : false
}

export const createDb = (url: string) => {
  const ssl = sslOption(url)
  const conn = postgres(url, {
    // Modest pool: this app's queries are short-lived, and serverless invokes
    // can stack up — keep the footprint per process small and let idle
    // connections drain instead of pinning Postgres slots forever.
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ...(ssl === undefined ? {} : { ssl }),
  })
  const db = createDrizzle(conn)
  return { db, conn }
}

let _sharedDb: ReturnType<typeof createDb> | null = null

/**
 * Shared pool for the app's own queries. Calling createDb() per request opens
 * a fresh pool each time and leaks connections until Postgres refuses new ones.
 */
export const getSharedDb = () => {
  if (!_sharedDb) {
    _sharedDb = createDb(env.DATABASE_URL)
  }
  return _sharedDb
}

export type DB = ReturnType<typeof createDrizzle>
