export interface ThreadPreview {
  sender: { name?: string; email: string }
  subject: string
  receivedOn: string
  unread: boolean
  starred: boolean
  /** Short plain-text body preview, when the provider supplies one. */
  snippet?: string
  /** True when the thread is known to carry attachments (provider-dependent). */
  hasAttachments?: boolean
}

export function normalizeThreadPreview(raw: unknown): ThreadPreview {
  const r = raw as Record<string, unknown> | undefined
  if (!r) {
    return {
      sender: { email: "unknown" },
      subject: "(no subject)",
      receivedOn: "",
      unread: false,
      starred: false,
    }
  }

  return {
    sender: extractSender(r),
    subject: extractSubject(r),
    receivedOn: extractReceivedOn(r),
    unread: extractUnread(r),
    starred: extractStarred(r),
    snippet: extractSnippet(r),
    hasAttachments: extractHasAttachments(r),
  }
}

export function extractThreadDate(raw: unknown): number {
  const { receivedOn } = normalizeThreadPreview(raw)
  if (!receivedOn) return 0
  const ts = new Date(receivedOn).getTime()
  return Number.isNaN(ts) ? 0 : ts
}

function extractSender(r: Record<string, unknown>): {
  name?: string
  email: string
} {
  const preview = r.preview as Record<string, unknown> | undefined
  if (preview?.sender && typeof preview.sender === "object") {
    const s = preview.sender as Record<string, unknown>
    if (typeof s.email === "string") {
      return { name: (s.name as string) || undefined, email: s.email }
    }
  }

  if (r.sender && typeof r.sender === "object") {
    const s = r.sender as Record<string, unknown>
    if (typeof s.email === "string") {
      return { name: (s.name as string) || undefined, email: s.email }
    }
  }

  if (r.from && typeof r.from === "object") {
    const from = r.from as Record<string, unknown>
    if (from.emailAddress && typeof from.emailAddress === "object") {
      const ea = from.emailAddress as Record<string, unknown>
      return {
        name: (ea.name as string) || undefined,
        email: (ea.address as string) ?? "",
      }
    }
  }

  return { email: "unknown" }
}

// Gmail snippets are HTML-entity encoded; decode the handful that actually
// show up so the list row doesn't render "&#39;" literally.
function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
}

function extractSnippet(r: Record<string, unknown>): string | undefined {
  const preview = r.preview as Record<string, unknown> | undefined
  const raw =
    (typeof preview?.snippet === "string" && preview.snippet) ||
    // Gmail thread list items carry `snippet`
    (typeof r.snippet === "string" && r.snippet) ||
    // Microsoft Graph messages carry `bodyPreview`
    (typeof r.bodyPreview === "string" && r.bodyPreview) ||
    undefined
  if (!raw) return undefined
  const decoded = decodeEntities(raw).replace(/\s+/g, " ").trim()
  return decoded || undefined
}

function extractHasAttachments(r: Record<string, unknown>): boolean | undefined {
  const preview = r.preview as Record<string, unknown> | undefined
  if (typeof preview?.hasAttachments === "boolean") {
    return preview.hasAttachments
  }
  // Microsoft Graph list projection includes `hasAttachments`
  if (typeof r.hasAttachments === "boolean") return r.hasAttachments
  return undefined
}

function extractSubject(r: Record<string, unknown>): string {
  const preview = r.preview as Record<string, unknown> | undefined
  if (typeof preview?.subject === "string") return preview.subject
  if (typeof r.subject === "string") return r.subject
  return "(no subject)"
}

function extractReceivedOn(r: Record<string, unknown>): string {
  const preview = r.preview as Record<string, unknown> | undefined
  if (typeof preview?.receivedOn === "string") return preview.receivedOn
  if (typeof r.receivedOn === "string") return r.receivedOn
  if (typeof r.receivedDateTime === "string") return r.receivedDateTime
  if (typeof r.internalDate === "string") {
    const d = new Date(Number(r.internalDate))
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return ""
}

function extractUnread(r: Record<string, unknown>): boolean {
  const preview = r.preview as Record<string, unknown> | undefined
  if (typeof preview?.unread === "boolean") return preview.unread
  if (typeof r.unread === "boolean") return r.unread
  if (typeof r.isRead === "boolean") return !r.isRead
  return false
}

function extractStarred(r: Record<string, unknown>): boolean {
  // Direct starred field (Gmail list, IMAP preview)
  const preview = r.preview as Record<string, unknown> | undefined
  if (typeof preview?.starred === "boolean") return preview.starred
  if (typeof r.starred === "boolean") return r.starred

  // Gmail: messages[].labelIds includes "STARRED"
  if (Array.isArray(r.messages)) {
    return (r.messages as Record<string, unknown>[]).some(
      (m) =>
        Array.isArray(m.labelIds) &&
        (m.labelIds as string[]).includes("STARRED")
    )
  }

  // IMAP thread detail: labels array contains { id: "STARRED" }
  if (Array.isArray(r.labels)) {
    return (r.labels as Record<string, unknown>[]).some(
      (l) => l.id === "STARRED"
    )
  }

  // Microsoft: flag.flagStatus === "flagged"
  if (r.flag && typeof r.flag === "object") {
    const f = r.flag as Record<string, unknown>
    if (f.flagStatus === "flagged") return true
  }

  // Tags from parsed messages
  if (Array.isArray(r.tags)) {
    return (r.tags as Record<string, unknown>[]).some(
      (t) =>
        typeof t.name === "string" && t.name.toLowerCase().startsWith("starred")
    )
  }

  return false
}
