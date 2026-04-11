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

export async function listContacts(query?: string, limit = 50, offset = 0) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)

  if (query && query.length >= 2) {
    return db.searchRecipients(query)
  }

  return db.listRecipients(limit, offset)
}

export async function createContact(email: string, name?: string) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)

  try {
    const [created] = await db.createRecipient(email, name ?? null)
    return created
  } catch (err: any) {
    if (err?.code === "23505" || err?.message?.includes("unique")) {
      throw new Error("A contact with this email already exists")
    }
    throw err
  }
}

export async function updateContact(id: string, name: string) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)

  await db.updateRecipient(id, { name })
}

export async function deleteContact(id: string) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)

  await db.deleteRecipient(id)
}
