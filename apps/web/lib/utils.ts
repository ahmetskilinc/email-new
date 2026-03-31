import {
  differenceInCalendarMonths,
  format,
  isThisMonth,
  isToday,
} from "date-fns"
import type { Sender } from "@/server/types"

export const FOLDERS = {
  SPAM: "spam",
  INBOX: "inbox",
  ARCHIVE: "archive",
  BIN: "bin",
  DRAFT: "draft",
  SENT: "sent",
  SNOOZED: "snoozed",
} as const

export const LABELS = {
  SPAM: "SPAM",
  INBOX: "INBOX",
  UNREAD: "UNREAD",
  IMPORTANT: "IMPORTANT",
  SENT: "SENT",
  TRASH: "TRASH",
  SNOOZED: "SNOOZED",
} as const

const parseAndValidateDate = (dateString: string): Date | null => {
  try {
    if (!dateString) return null
    const dateObj = new Date(dateString)
    if (isNaN(dateObj.getTime())) return null
    return dateObj
  } catch {
    return null
  }
}

export function formatDate(dateInput: string | Date | number): string {
  if (typeof dateInput === "number") {
    dateInput = new Date(dateInput).toISOString()
  }

  if (dateInput instanceof Date) {
    return dateInput.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const dateObj = parseAndValidateDate(dateInput as string)
  if (!dateObj) return ""

  try {
    const now = new Date()
    if (isToday(dateObj)) return format(dateObj, "h:mm a")

    const hoursDifference =
      (now.getTime() - dateObj.getTime()) / (1000 * 60 * 60)
    if (hoursDifference <= 12) return format(dateObj, "h:mm a")

    if (
      isThisMonth(dateObj) ||
      differenceInCalendarMonths(now, dateObj) === 1
    ) {
      return format(dateObj, "MMM dd")
    }

    return format(dateObj, "MM/dd/yy")
  } catch {
    return ""
  }
}

export const formatTime = (date: string) => {
  const dateObj = parseAndValidateDate(date)
  if (!dateObj) return ""
  try {
    return format(dateObj, "h:mm a")
  } catch {
    return ""
  }
}

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i!)).toFixed(2)) + " " + sizes[i]
}
