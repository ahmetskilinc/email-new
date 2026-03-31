"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Settings04Icon,
  Link04Icon,
  Notification03Icon,
  UserAccountIcon,
  PaintBoardIcon,
} from "@hugeicons-pro/core-stroke-rounded"
import { GeneralTab } from "./general-tab"
import { AccountTab } from "./account-tab"
import { ConnectionsTab } from "./connections-tab"
import { NotificationsTab } from "./notifications-tab"

type SettingsTab = "general" | "account" | "connections" | "notifications"

const tabs: {
  id: SettingsTab
  label: string
  icon: any
  title: string
  description: string
}[] = [
  {
    id: "general",
    label: "General",
    icon: PaintBoardIcon,
    title: "General",
    description: "Customize the look and behavior of the app.",
  },
  {
    id: "account",
    label: "Account",
    icon: UserAccountIcon,
    title: "Account",
    description: "Manage your account details.",
  },
  {
    id: "connections",
    label: "Connections",
    icon: Link04Icon,
    title: "Email Accounts",
    description: "Manage your connected email accounts.",
  },
  // { id: "notifications", label: "Notifications", icon: Notification03Icon, title: "Notifications", description: "Choose what notifications you want to receive." },
]

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTab?: SettingsTab
}

export function SettingsDialog({
  open,
  onOpenChange,
  defaultTab = "general",
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = React.useState<SettingsTab>(defaultTab)

  React.useEffect(() => {
    if (open) setActiveTab(defaultTab)
  }, [open, defaultTab])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[min(36rem,85vh)] w-full overflow-hidden p-0 sm:max-w-3xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex h-full min-h-0">
          {/* Sidebar nav — always visible, never scrolls */}
          <div className="flex w-48 shrink-0 flex-col gap-1 border-r border-border bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-2 px-2 py-1">
              <HugeiconsIcon
                icon={Settings04Icon}
                className="size-4 text-muted-foreground"
              />
              <span className="text-sm font-semibold">Settings</span>
            </div>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  activeTab === tab.id
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <HugeiconsIcon icon={tab.icon} className="size-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Pinned header */}
            <div className="shrink-0 border-b border-border px-6 pt-6 pb-4">
              <h2 className="text-base font-semibold">
                {tabs.find((t) => t.id === activeTab)?.title}
              </h2>
              <p className="text-sm text-muted-foreground">
                {tabs.find((t) => t.id === activeTab)?.description}
              </p>
            </div>

            {/* Scrollable body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {activeTab === "general" && <GeneralTab />}
              {activeTab === "account" && <AccountTab />}
              {activeTab === "connections" && <ConnectionsTab />}
              {activeTab === "notifications" && <NotificationsTab />}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
