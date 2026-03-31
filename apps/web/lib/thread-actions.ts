import { modifyLabels } from "@/server/actions/mail"
import { LABELS, FOLDERS } from "@/lib/utils"

export type ThreadDestination =
  | "inbox"
  | "archive"
  | "spam"
  | "bin"
  | "snoozed"
  | null
export type FolderLocation =
  | "inbox"
  | "archive"
  | "spam"
  | "sent"
  | "bin"
  | string

export interface MoveThreadOptions {
  threadIds: string[]
  currentFolder: FolderLocation
  destination: ThreadDestination
}

export async function moveThreadsTo({
  threadIds,
  currentFolder,
  destination,
}: MoveThreadOptions) {
  try {
    if (!threadIds.length) return
    const isInInbox = currentFolder === FOLDERS.INBOX || !currentFolder
    const isInSpam = currentFolder === FOLDERS.SPAM
    const isInBin = currentFolder === FOLDERS.BIN

    let addLabel = ""
    let removeLabel = ""

    switch (destination) {
      case "inbox":
        addLabel = LABELS.INBOX
        removeLabel = isInSpam
          ? LABELS.SPAM
          : isInBin
            ? LABELS.TRASH
            : ""
        break
      case "archive":
        addLabel = ""
        removeLabel = isInInbox
          ? LABELS.INBOX
          : isInSpam
            ? LABELS.SPAM
            : isInBin
              ? LABELS.TRASH
              : ""
        break
      case "spam":
        addLabel = LABELS.SPAM
        removeLabel = isInInbox
          ? LABELS.INBOX
          : isInBin
            ? LABELS.TRASH
            : ""
        break
      case "snoozed":
        addLabel = LABELS.SNOOZED
        removeLabel = isInInbox
          ? LABELS.INBOX
          : isInSpam
            ? LABELS.SPAM
            : isInBin
              ? LABELS.TRASH
              : ""
        break
      case "bin":
        addLabel = LABELS.TRASH
        removeLabel = isInInbox
          ? LABELS.INBOX
          : isInSpam
            ? LABELS.SPAM
            : ""
        break
      default:
        return
    }

    if (!addLabel && !removeLabel) return

    return modifyLabels(
      threadIds,
      addLabel ? [addLabel] : [],
      removeLabel ? [removeLabel] : [],
    )
  } catch (error) {
    console.error("Error moving thread(s):", error)
    throw error
  }
}
