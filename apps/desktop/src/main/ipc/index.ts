import { registerMailHandlers } from "./mail"
import { registerConnectionHandlers } from "./connections"
import { registerSettingsHandlers } from "./settings"
import { registerCalendarHandlers } from "./calendar"
import { registerSignatureHandlers } from "./signatures"
import { registerLabelHandlers } from "./labels"
import { registerDraftHandlers } from "./drafts"
import { registerContactHandlers } from "./contacts"
import { registerAuthHandlers } from "./auth"

export function registerIpcHandlers(): void {
  registerMailHandlers()
  registerConnectionHandlers()
  registerSettingsHandlers()
  registerCalendarHandlers()
  registerSignatureHandlers()
  registerLabelHandlers()
  registerDraftHandlers()
  registerContactHandlers()
  registerAuthHandlers()
}
