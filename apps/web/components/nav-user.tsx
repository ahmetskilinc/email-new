"use client"

import { DropdownMenu, Avatar, Button } from "bruv-ui"
import {
  EllipsisHorizontalIcon,
  ArrowRightStartOnRectangleIcon,
  PlusCircleIcon,
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  Cog6ToothIcon,
  LinkIcon,
} from "@heroicons/react/16/solid"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useDualSidebar,
} from "@workspace/ui/components/dual-sidebar"
import {
  AccountSwitchDialog,
  type SwitchTarget,
} from "./connection/account-switch-dialog"
import { useActiveConnection, useConnections } from "@/hooks/use-connections"
import { emailProviders } from "@/lib/constants"
import { useSession } from "@/lib/auth-client"
import { signOut } from "@/lib/auth-client"
import { useTheme } from "next-themes"
import { cn } from "@workspace/ui/lib/utils"
import { useEffect, useState } from "react"
import { toast } from "bruv-ui"
import { useOpenSettings } from "@/store/settings"
import { AddConnectionDialog } from "./settings/add-connection-dialog"
import { clearPersistedQueryCache } from "@/providers/query-provider"

const themeOptions = [
  {
    label: "Light",
    value: "light",
    Icon: <SunIcon />,
  },
  {
    label: "Dark",
    value: "dark",
    Icon: <MoonIcon />,
  },
  {
    label: "System",
    value: "system",
    Icon: <ComputerDesktopIcon />,
  },
] as const

export function NavUser() {
  const [switchTarget, setSwitchTarget] = useState<SwitchTarget | null>(null)
  const [mounted, setMounted] = useState(typeof window !== "undefined")
  const openSettings = useOpenSettings()
  const [addConnectionOpen, setAddConnectionOpen] = useState(false)
  const { isMobile } = useDualSidebar()
  const { theme, setTheme } = useTheme()
  const activeTheme = theme ?? "system"
  const { data: sesionData } = useSession()
  const { data: activeConnection } = useActiveConnection()
  const { data: connectionsData } = useConnections()
  const user = sesionData?.user
  const connections = connectionsData?.connections

  useEffect(() => setMounted(true), [])

  const handleAccountSwitch =
    (connection: {
      id: string
      name: string | null
      email: string
      picture: string | null
      providerId: string
    }) =>
    () => {
      if (connection.id === activeConnection?.id) return
      setSwitchTarget(connection)
    }

  const handleLogout = async () => {
    // Tear the cached mail down with the session. The persisted query cache
    // keeps message bodies in IndexedDB, so without this the previous user's
    // mail is still sitting there for whoever signs in next on this machine.
    const signOutAndClear = signOut().finally(() => clearPersistedQueryCache())
    toast.promise(signOutAndClear, {
      loading: "Signing out...",
      success: () => "Signed out successfully!",
      error: "Error signing out",
      async finally() {
        window.location.href = "/login"
      },
    })
  }

  const otherConnections = connections?.filter(
    (c) => c.id !== activeConnection?.id
  )

  const conn = mounted ? activeConnection : undefined
  const ActiveConnectionIcon = emailProviders.find(
    (p) => p.providerId === conn?.providerId
  )?.icon

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-bruv-subtle data-[state=open]:text-bruv-primary"
                >
                  {conn?.picture ? (
                    <Avatar
                      size="md"
                      src={conn.picture}
                      alt={conn.name || conn.email}
                      initials={(conn.name || conn.email)
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    />
                  ) : (
                    <div className="flex size-8 items-center justify-center rounded-full border bg-bruv-subtle">
                      {ActiveConnectionIcon && (
                        <ActiveConnectionIcon className="size-4" />
                      )}
                    </div>
                  )}
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[state=collapsed]:hidden">
                    <span className="truncate font-medium">{conn?.name}</span>
                    <span className="truncate text-xs text-bruv-tertiary">
                      {conn?.email}
                    </span>
                  </div>
                  <EllipsisHorizontalIcon className="ml-auto grid size-4 group-data-[state=collapsed]:hidden" />
                </SidebarMenuButton>
              }
            />
            <DropdownMenu.Content
              minWidth="min-w-56"
              className="rounded-bruv-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenu.Group>
                <DropdownMenu.Item>
                  <div className="flex items-center gap-2 text-left text-sm">
                    {conn?.picture ? (
                      <Avatar
                        size="md"
                        src={conn.picture}
                        alt={conn.name || conn.email}
                        initials={(conn.name || conn.email)
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      />
                    ) : (
                      <div className="flex size-8 items-center justify-center rounded-full border bg-bruv-subtle">
                        {ActiveConnectionIcon && (
                          <ActiveConnectionIcon className="size-4" />
                        )}
                      </div>
                    )}
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="flex items-center gap-px truncate font-medium">
                        <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-bruv-success duration-2000" />
                        {conn?.name}
                      </span>
                      <span className="truncate text-xs text-bruv-tertiary">
                        {conn?.email}
                      </span>
                    </div>
                  </div>
                </DropdownMenu.Item>
              </DropdownMenu.Group>
              <DropdownMenu.Group>
                {otherConnections &&
                  otherConnections.map((connection) => {
                    const Icon = emailProviders.find(
                      (p) => p.providerId === connection.providerId
                    )?.icon
                    return (
                      <DropdownMenu.Item
                        key={connection.id}
                        onClick={handleAccountSwitch(connection)}
                      >
                        {connection.picture ? (
                          <Avatar
                            size="sm"
                            src={connection.picture}
                            alt={connection.name || connection.email}
                            initials={(connection.name || connection.email)
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2)}
                          />
                        ) : (
                          <div className="flex size-8 items-center justify-center rounded-full border bg-bruv-subtle">
                            {Icon && <Icon className="size-4" />}
                          </div>
                        )}
                        <div className="-space-y-0.5">
                          <p className="text-[12px]">
                            {connection.name || connection.email}
                          </p>
                          {connection.name && (
                            <p className="text-[11px] text-bruv-tertiary">
                              {connection.email.length > 25
                                ? `${connection.email.slice(0, 25)}...`
                                : connection.email}
                            </p>
                          )}
                        </div>
                      </DropdownMenu.Item>
                    )
                  })}
              </DropdownMenu.Group>
              <DropdownMenu.Separator />
              <DropdownMenu.Group>
                <DropdownMenu.Item
                  icon={<PlusCircleIcon />}
                  onClick={() => setAddConnectionOpen(true)}
                >
                  Add Connection
                </DropdownMenu.Item>
              </DropdownMenu.Group>
              <DropdownMenu.Separator />
              <DropdownMenu.Group>
                <DropdownMenu.Item
                  icon={<Cog6ToothIcon />}
                  onClick={() => openSettings("general")}
                >
                  General
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  icon={<LinkIcon />}
                  onClick={() => openSettings("connections")}
                >
                  Connections
                </DropdownMenu.Item>
              </DropdownMenu.Group>
              <DropdownMenu.Separator />
              <DropdownMenu.Group>
                <div className="flex items-center justify-between pl-2">
                  <span className="text-[13px] font-medium">Appearance</span>
                  <div className="flex items-center">
                    {themeOptions.map((option, i) => (
                      <Button
                        key={option.value}
                        variant="transparent"
                        size="sm"
                        className={cn(
                          "flex items-center justify-center p-1.5 text-bruv-primary transition-colors hover:bg-bruv-subtle hover:text-bruv-primary",
                          activeTheme === option.value &&
                            "bg-bruv-subtle text-bruv-primary"
                        )}
                        onClick={() => {
                          setTheme(option.value)
                        }}
                        type="button"
                        iconLeft={option.Icon}
                        aria-label={`${option.label} theme`}
                      />
                    ))}
                  </div>
                </div>
              </DropdownMenu.Group>
              <DropdownMenu.Separator />
              <DropdownMenu.Group>
                <DropdownMenu.Item
                  icon={<ArrowRightStartOnRectangleIcon />}
                  onClick={handleLogout}
                >
                  Log out
                </DropdownMenu.Item>
              </DropdownMenu.Group>
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </SidebarMenuItem>
      </SidebarMenu>
      <AccountSwitchDialog
        target={switchTarget}
        onComplete={() => setSwitchTarget(null)}
      />
      <AddConnectionDialog
        open={addConnectionOpen}
        onOpenChange={setAddConnectionOpen}
      />
    </>
  )
}
