"use server"

import { requireSession } from "../lib/session"
import { getzeitmailDB } from "../lib/server-utils"

export async function listSignatures(connectionId?: string) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)

  const sigs = connectionId
    ? await db.findSignaturesByConnection(connectionId)
    : await db.findAllSignatures()

  return sigs.map((s) => ({
    id: s.id,
    connectionId: s.connectionId,
    name: s.name,
    body: s.body,
    isDefault: s.isDefault,
    createdAt: s.createdAt,
  }))
}

export async function createSignature(input: {
  connectionId: string
  name: string
  body: string
  isDefault: boolean
}) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)

  const conn = await db.findUserConnection(input.connectionId)
  if (!conn) throw new Error("Connection not found")

  if (input.isDefault) {
    await db.clearDefaultSignatures(input.connectionId)
  }

  const [created] = await db.createSignature(input)
  return { id: created!.id }
}

export async function updateSignature(
  id: string,
  input: { name?: string; body?: string; isDefault?: boolean },
) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)

  const existing = await db.findSignature(id)
  if (!existing) throw new Error("Signature not found")

  if (input.isDefault) {
    await db.clearDefaultSignatures(existing.connectionId)
  }

  await db.updateSignature(id, input)
  return { success: true }
}

export async function deleteSignature(id: string) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)

  const existing = await db.findSignature(id)
  if (!existing) throw new Error("Signature not found")

  await db.deleteSignature(id)
  return { success: true }
}
