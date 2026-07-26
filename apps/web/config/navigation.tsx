import {
  EnvelopeIcon,
  PencilSquareIcon,
  PaperAirplaneIcon,
  ArchiveBoxIcon,
  TrashIcon,
  CalendarIcon,
  UsersIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/16/solid"
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
    icon: <EnvelopeIcon className="h-4 w-4" />,
  },
  {
    id: "drafts",
    title: "Drafts",
    href: "/mail/draft",
    icon: <PencilSquareIcon className="h-4 w-4" />,
  },
  {
    id: "sent",
    title: "Sent",
    href: "/mail/sent",
    icon: <PaperAirplaneIcon className="h-4 w-4" />,
  },
  {
    id: "archive",
    title: "Archive",
    href: "/mail/archive",
    icon: <ArchiveBoxIcon className="h-4 w-4" />,
  },
  {
    id: "trash",
    title: "Bin",
    href: "/mail/bin",
    icon: <TrashIcon className="h-4 w-4" />,
  },
]

export const navigationConfigTopNav: NavItem[] = [
  {
    id: "all-inboxes",
    title: "All Inboxes",
    href: "/mail/all-inboxes",
    icon: <EnvelopeIcon className="h-4 w-4" />,
  },
  {
    id: "calendar",
    title: "Calendar",
    href: "/calendar",
    icon: <CalendarIcon className="h-4 w-4" />,
  },
  {
    id: "contacts",
    title: "Contacts",
    href: "/contacts",
    icon: <UsersIcon className="h-4 w-4" />,
  },
  {
    id: "search",
    title: "Search",
    href: "/mail/search",
    icon: <MagnifyingGlassIcon className="h-4 w-4" />,
  },
]
