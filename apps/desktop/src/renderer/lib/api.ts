/**
 * Drop-in replacement for apps/web/server/actions/*.
 *
 * Every export here mirrors the signature of a server action so that
 * components and hooks only need their import path changed:
 *   - import { listThreads } from "@/server/actions/mail"
 *   + import { listThreads } from "@/lib/api"
 */

// ── Mail ────────────────────────────────────────────────────────────────
export const listThreads = (
  folder: string,
  query?: string,
  maxResults?: number,
  cursor?: string,
  labelIds?: string[],
) => window.api.mail.listThreads(folder, query, maxResults, cursor, labelIds)

export const listAllInboxes = (maxResults?: number, cursor?: string) =>
  window.api.mail.listAllInboxes(maxResults, cursor)

export const getThread = (id: string, connectionId?: string) =>
  window.api.mail.getThread(id, connectionId)

export const sendMail = (data: unknown) => window.api.mail.sendMail(data)

export const markAsRead = (threadIds: string[], connectionId?: string) =>
  window.api.mail.markAsRead(threadIds, connectionId)

export const markAsUnread = (threadIds: string[]) =>
  window.api.mail.markAsUnread(threadIds)

export const deleteThread = (id: string) => window.api.mail.deleteThread(id)

export const modifyLabels = (
  ids: string[],
  options: { addLabels: string[]; removeLabels: string[] },
) => window.api.mail.modifyLabels(ids, options)

export const processEmailContent = (
  html: string,
  shouldLoadImages: boolean,
  theme: "light" | "dark",
) => window.api.mail.processEmailContent(html, shouldLoadImages, theme)

export const toggleStar = (threadIds: string[], starred: boolean) =>
  window.api.mail.toggleStar(threadIds, starred)

export const getRawEmail = (id: string) => window.api.mail.getRawEmail(id)

export const pollNewMessages = async () => {
  // In the desktop app, polling is handled by the main process.
  // This is a no-op stub for compatibility with hooks that call it.
  return { hasNew: false }
}

// ── Connections ─────────────────────────────────────────────────────────
export const listConnections = () => window.api.connections.list()

export const setDefaultConnection = (id: string) =>
  window.api.connections.setDefault(id)

export const deleteConnection = (id: string) =>
  window.api.connections.delete(id)

export const createIcloudConnection = (email: string, password: string) =>
  window.api.connections.createImap("icloud", email, {
    accessToken: password,
    scope: "imap",
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  })

export const createYahooConnection = (email: string, password: string) =>
  window.api.connections.createImap("yahoo", email, {
    accessToken: password,
    scope: "imap",
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  })

export const createCustomConnection = (
  email: string,
  password: string,
  imapConfig: unknown,
) =>
  window.api.connections.createImap("custom", email, {
    accessToken: password,
    scope: "imap",
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    imapConfig,
  })

// ── Calendar ────────────────────────────────────────────────────────────
export const getCalendarEvents = (timeMin: string, timeMax: string) =>
  window.api.calendar.getEvents(timeMin, timeMax)

export const getCalendars = () => window.api.calendar.getCalendars()

export const createCalendarEvent = (input: unknown) =>
  window.api.calendar.createEvent(input)

export const updateCalendarEvent = (input: unknown) =>
  window.api.calendar.updateEvent(input)

export const deleteCalendarEvent = (input: unknown) =>
  window.api.calendar.deleteEvent(input)

// ── Settings ────────────────────────────────────────────────────────────
export const getSettings = () => window.api.settings.get()

export const saveSettings = (settings: unknown) =>
  window.api.settings.save(settings)

// ── Signatures ──────────────────────────────────────────────────────────
export const getSignatures = (connectionId?: string) =>
  window.api.signatures.list(connectionId)

export const createSignature = (data: unknown) =>
  window.api.signatures.create(data)

export const updateSignature = (id: string, data: unknown) =>
  window.api.signatures.update(id, data)

export const deleteSignature = (id: string) =>
  window.api.signatures.delete(id)

// ── Labels ──────────────────────────────────────────────────────────────
export const listLabels = () => window.api.labels.list()

// ── Drafts ──────────────────────────────────────────────────────────────
export const getDrafts = () => window.api.drafts.list()

export const createDraft = (data: unknown) => window.api.drafts.create(data)

// ── Contacts ────────────────────────────────────────────────────────────
export const searchRecipients = (query: string) =>
  window.api.contacts.search(query)

// ── BIMI ────────────────────────────────────────────────────────────────
export const getBimiByEmail = async (_email: string) => {
  // BIMI DNS lookups are complex and not critical for desktop MVP.
  // Return null to skip BIMI avatars.
  return null
}

// ── Auth (desktop-specific) ─────────────────────────────────────────────
export const getUser = () => window.api.auth.getUser()
export const createLocalUser = (data: { name: string; email: string }) =>
  window.api.auth.createLocalUser(data)
export const deleteUser = () => window.api.auth.deleteUser()
