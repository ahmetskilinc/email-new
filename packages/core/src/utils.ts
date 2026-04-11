export const FOLDERS = {
  SPAM: "spam",
  INBOX: "inbox",
  ARCHIVE: "archive",
  BIN: "bin",
  DRAFT: "draft",
  SENT: "sent",
  SNOOZED: "snoozed",
} as const

export const defaultPageSize = 20

const categorySearchValues = [
  "is:important NOT is:sent NOT is:draft",
  "NOT is:draft (is:inbox OR (is:sent AND to:me))",
  "is:personal NOT is:sent NOT is:draft",
  "is:updates NOT is:sent NOT is:draft",
  "is:promotions NOT is:sent NOT is:draft",
  "is:unread NOT is:sent NOT is:draft",
]

export const cleanSearchValue = (q: string): string => {
  const escapedValues = categorySearchValues.map((value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  )
  return q
    .replace(new RegExp(escapedValues.join("|"), "g"), "")
    .replace(/\s+/g, " ")
    .trim()
}
