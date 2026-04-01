export interface ThreadPreview {
  sender: { name?: string; email: string }
  subject: string
  receivedOn: string
  unread: boolean
}

export function normalizeThreadPreview(raw: unknown): ThreadPreview {
  const r = raw as Record<string, unknown> | undefined
  if (!r) {
    return {
      sender: { email: "unknown" },
      subject: "(no subject)",
      receivedOn: "",
      unread: false,
    }
  }

  return {
    sender: extractSender(r),
    subject: extractSubject(r),
    receivedOn: extractReceivedOn(r),
    unread: extractUnread(r),
  }
}

export function extractThreadDate(raw: unknown): number {
  const { receivedOn } = normalizeThreadPreview(raw)
  if (!receivedOn) return 0
  const ts = new Date(receivedOn).getTime()
  return Number.isNaN(ts) ? 0 : ts
}

function extractSender(r: Record<string, unknown>): { name?: string; email: string } {
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
