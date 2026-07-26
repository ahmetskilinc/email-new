"use client"

import * as React from "react"
import { Dialog } from "bruv-ui"
import { cn } from "@workspace/ui/lib/utils"
import {
  Cog6ToothIcon,
  LinkIcon,
  BellIcon,
  UserCircleIcon,
  PaintBrushIcon,
  PencilSquareIcon,
  ArrowLeftIcon,
  XMarkIcon,
} from "@heroicons/react/16/solid"
import { GeneralTab } from "./general-tab"
import { AccountTab } from "./account-tab"
import { ConnectionsTab } from "./connections-tab"
import { NotificationsTab } from "./notifications-tab"
import { SignaturesTab } from "./signatures-tab"
import { useSettingsDialog, type SettingsTab } from "@/store/settings"

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
    icon: PaintBrushIcon,
    title: "General",
    description: "Customize the look and behavior of the app.",
  },
  {
    id: "account",
    label: "Account",
    icon: UserCircleIcon,
    title: "Account",
    description: "Manage your account details.",
  },
  {
    id: "connections",
    label: "Connections",
    icon: LinkIcon,
    title: "Email Accounts",
    description: "Manage your connected email accounts.",
  },
  {
    id: "signatures",
    label: "Signatures",
    icon: PencilSquareIcon,
    title: "Signatures",
    description: "Manage email signatures for your accounts.",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: BellIcon,
    title: "Notifications",
    description: "Choose what notifications you want to receive.",
  },
]

export function SettingsDialog() {
  const [{ open, tab }, setOpen] = useSettingsDialog()
  const [activeTab, setActiveTab] = React.useState<SettingsTab>(tab)
  const [mobileShowContent, setMobileShowContent] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setActiveTab(tab)
      setMobileShowContent(false)
    }
  }, [open, tab])

  const onOpenChange = React.useCallback(
    (value: boolean) => setOpen(value),
    [setOpen]
  )

  const activeTabData = tabs.find((t) => t.id === activeTab)

  const tabContent = (
    <>
      {activeTab === "general" && <GeneralTab />}
      {activeTab === "account" && <AccountTab />}
      {activeTab === "connections" && <ConnectionsTab />}
      {activeTab === "signatures" && <SignaturesTab />}
      {activeTab === "notifications" && <NotificationsTab />}
    </>
  )

  const sidebarNav = (
    <>
      <div className="mb-2 flex items-center gap-2 px-2 py-1">
        <Cog6ToothIcon className="size-4 text-bruv-tertiary" />
        <span className="text-sm font-semibold">Settings</span>
      </div>
      {tabs.map((tab) => {
        const TabIcon = tab.icon
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id)
              setMobileShowContent(true)
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-bruv-md px-2 py-1.5 text-left text-sm transition-colors",
              activeTab === tab.id
                ? "bg-bruv-subtle font-medium text-bruv-primary"
                : "text-bruv-tertiary hover:bg-bruv-subtle/60 hover:text-bruv-primary"
            )}
          >
            <TabIcon className="size-3.5" />
            {tab.label}
          </button>
        )
      })}
    </>
  )

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="h-[min(36rem,85vh)] w-[90vw] max-w-3xl overflow-hidden p-0">
        <Dialog.Title className="sr-only border-none p-0">Settings</Dialog.Title>

        {/* Desktop: side-by-side */}
        <div className="hidden h-full min-h-0 sm:flex">
          <div className="flex w-48 shrink-0 flex-col gap-1 border-r border-bruv-neutral bg-bruv-subtle/30 p-3">
            {sidebarNav}
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-bruv-neutral px-6 pt-6 pb-4">
              <h2 className="text-base font-semibold">
                {activeTabData?.title}
              </h2>
              <p className="text-sm text-bruv-tertiary">
                {activeTabData?.description}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {tabContent}
            </div>
          </div>
        </div>

        {/* Mobile: stacked navigation */}
        <div className="flex h-full min-h-0 flex-col sm:hidden">
          {!mobileShowContent ? (
            <div className="flex flex-1 flex-col gap-1 p-3">
              <div className="mb-2 flex items-center justify-between px-2 py-1">
                <div className="flex items-center gap-2">
                  <Cog6ToothIcon className="size-4 text-bruv-tertiary" />
                  <span className="text-sm font-semibold">Settings</span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="text-bruv-tertiary hover:text-bruv-primary"
                >
                  <XMarkIcon className="size-4" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
              {tabs.map((tab) => {
                const TabIcon = tab.icon
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id)
                      setMobileShowContent(true)
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-bruv-md px-2 py-1.5 text-left text-sm transition-colors",
                      activeTab === tab.id
                        ? "bg-bruv-subtle font-medium text-bruv-primary"
                        : "text-bruv-tertiary hover:bg-bruv-subtle/60 hover:text-bruv-primary"
                    )}
                  >
                    <TabIcon className="size-3.5" />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between border-b border-bruv-neutral px-3 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMobileShowContent(false)}
                    className="text-bruv-tertiary hover:text-bruv-primary"
                  >
                    <ArrowLeftIcon className="size-4" />
                  </button>
                  <h2 className="text-sm font-semibold">
                    {activeTabData?.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="text-bruv-tertiary hover:text-bruv-primary"
                >
                  <XMarkIcon className="size-4" />
                  <span className="sr-only">Close</span>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {tabContent}
              </div>
            </>
          )}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
