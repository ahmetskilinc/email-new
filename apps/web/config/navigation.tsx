import {
  Mail01Icon,
  MailEdit01Icon,
  MailSend01Icon,
  ArchiveIcon,
  Delete02Icon,
  Settings04Icon,
  Mail02Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import { HugeiconsIcon } from "@hugeicons/react"
import React from "react"

export interface NavItem {
  id?: string
  title: string
  href: string
  icon: React.ReactNode
  badge?: number
  isBackButton?: boolean
}

export const navigationConfig: NavItem[] = [
  {
    id: "inbox",
    title: "Inbox",
    href: "/mail/inbox",
    icon: <HugeiconsIcon icon={Mail01Icon} className="h-4 w-4" />,
  },
  {
    id: "drafts",
    title: "Drafts",
    href: "/mail/draft",
    icon: <HugeiconsIcon icon={MailEdit01Icon} className="h-4 w-4" />,
  },
  {
    id: "sent",
    title: "Sent",
    href: "/mail/sent",
    icon: <HugeiconsIcon icon={MailSend01Icon} className="h-4 w-4" />,
  },
  {
    id: "archive",
    title: "Archive",
    href: "/mail/archive",
    icon: <HugeiconsIcon icon={ArchiveIcon} className="h-4 w-4" />,
  },
  {
    id: "trash",
    title: "Bin",
    href: "/mail/bin",
    icon: <HugeiconsIcon icon={Delete02Icon} className="h-4 w-4" />,
  },
]

export const navigationConfigTopNav: NavItem[] = [
  {
    id: "all-inboxes",
    title: "All Inboxes",
    href: "/mail/all-inboxes",
    icon: <HugeiconsIcon icon={Mail02Icon} className="h-4 w-4" />,
  },
]
