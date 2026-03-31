"use server"

import { requireSession } from "../lib/session"
import {
  defaultUserSettings,
  userSettingsSchema,
  type UserSettings,
} from "../lib/schemas"
import { getzeitmailDB } from "../lib/server-utils"

export async function getSettings() {
  try {
    const session = await requireSession()
    const db = await getzeitmailDB(session.user.id)
    const result: any = await db.findUserSettings()

    if (!result) return { settings: defaultUserSettings }

    const settingsRes = userSettingsSchema.safeParse(result.settings)
    if (!settingsRes.success) {
      void db.updateUserSettings(defaultUserSettings)
      return { settings: defaultUserSettings }
    }

    return { settings: settingsRes.data }
  } catch {
    return { settings: defaultUserSettings }
  }
}

export async function saveSettings(
  input: Partial<UserSettings>,
) {
  const session = await requireSession()
  const db = await getzeitmailDB(session.user.id)
  const existingSettings: any = await db.findUserSettings()

  if (existingSettings) {
    const newSettings: any = {
      ...(existingSettings.settings as UserSettings),
      ...input,
    }
    await db.updateUserSettings(newSettings)
  } else {
    await db.insertUserSettings({
      ...(defaultUserSettings as any),
      ...input,
    })
  }

  return { success: true }
}
