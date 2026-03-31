"use server"

import { requireActiveDriver } from "../lib/session"
import type { CreateDraftData } from "../lib/schemas"

export async function getDraft(id: string) {
  const { driver } = await requireActiveDriver()
  return driver.getDraft(id)
}

export async function listDrafts(params: {
  q?: string
  maxResults?: number
  pageToken?: string
}) {
  const { driver } = await requireActiveDriver()
  return driver.listDrafts(params)
}

export async function createDraft(data: CreateDraftData) {
  const { driver } = await requireActiveDriver()
  return driver.createDraft(data)
}

export async function deleteDraft(id: string) {
  const { driver } = await requireActiveDriver()
  return driver.deleteDraft(id)
}
