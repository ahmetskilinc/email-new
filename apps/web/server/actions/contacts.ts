"use server"

import { requireSession } from "../lib/session"
import { getzeitmailDB } from "../lib/server-utils"

export async function searchRecipients(query: string) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)

  if (!query || query.length < 2) return []

  const results = await db.searchRecipients(query)
  return results.map((r) => ({
    email: r.email,
    name: r.name,
  }))
}
