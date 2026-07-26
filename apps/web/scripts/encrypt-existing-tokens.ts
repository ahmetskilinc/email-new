/**
 * One-time backfill: encrypts connection credentials that predate
 * encryption-at-rest.
 *
 * Google/Microsoft access and refresh tokens were previously written to the
 * `connection` table in plaintext. `encrypt()` now runs on every write and
 * `decryptSecret()` passes legacy plaintext through unchanged, so the app keeps
 * working before this runs — but until it does, the highest-value secrets in the
 * database are still readable by anyone who can read the database.
 *
 * Idempotent: rows already carrying the "v1." envelope are skipped.
 *
 *   bun run --cwd apps/web scripts/encrypt-existing-tokens.ts
 *
 * Take a database backup first, and make sure ENCRYPTION_KEY is the same value
 * the application runs with — re-running with a different key will render the
 * affected rows undecryptable.
 */
import { eq } from "drizzle-orm"
import { createDb } from "../server/db"
import { connection } from "../server/db/schema"
import { encrypt, isEncrypted } from "../server/lib/encryption"
import { env } from "../server/env"

async function main() {
  const { db, conn } = createDb(env.DATABASE_URL)

  const rows = await db.select().from(connection)
  let encrypted = 0
  let skipped = 0

  for (const row of rows) {
    const updates: { accessToken?: string; refreshToken?: string } = {}

    if (row.accessToken && !isEncrypted(row.accessToken)) {
      updates.accessToken = encrypt(row.accessToken)
    }
    if (row.refreshToken && !isEncrypted(row.refreshToken)) {
      updates.refreshToken = encrypt(row.refreshToken)
    }

    if (Object.keys(updates).length === 0) {
      skipped++
      continue
    }

    await db.update(connection).set(updates).where(eq(connection.id, row.id))
    encrypted++
  }

  console.log(
    `[encrypt-existing-tokens] encrypted ${encrypted} connection(s), ${skipped} already encrypted`
  )

  await conn.end()
}

main().catch((error) => {
  console.error("[encrypt-existing-tokens] failed:", error)
  process.exit(1)
})
