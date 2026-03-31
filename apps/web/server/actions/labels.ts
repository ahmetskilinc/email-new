"use server"

import { requireActiveDriver } from "../lib/session"

export async function listLabels() {
  const { driver } = await requireActiveDriver()
  return driver.getUserLabels()
}

export async function createLabel(input: {
  name: string
  color?: { backgroundColor: string; textColor: string }
}) {
  const { driver } = await requireActiveDriver()
  return driver.createLabel(input)
}

export async function updateLabel(
  id: string,
  label: {
    name: string
    type?: string
    color?: { backgroundColor: string; textColor: string }
  },
) {
  const { driver } = await requireActiveDriver()
  return driver.updateLabel(id, label)
}

export async function deleteLabel(id: string) {
  const { driver } = await requireActiveDriver()
  return driver.deleteLabel(id)
}
