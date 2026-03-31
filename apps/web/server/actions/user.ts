"use server"

import { requireSession } from "../lib/session"
import { auth } from "../lib/auth"
import { headers } from "next/headers"

export async function deleteUser() {
  const session = await requireSession()
  await auth.api.deleteUser({
    headers: await headers(),
    body: {},
  })
  return { success: true }
}
