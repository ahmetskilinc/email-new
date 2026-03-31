"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  MoreHorizontalCircle01Icon,
  Logout01Icon,
  AddCircleIcon,
  Sun01Icon,
  Moon01Icon,
  MonitorStopIcon,
} from "@hugeicons-pro/core-stroke-rounded"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar"
import {
  AccountSwitchDialog,
  type SwitchTarget,
} from "./connection/account-switch-dialog"
import { useActiveConnection, useConnections } from "@/hooks/use-connections"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { emailProviders } from "@/lib/constants"
import { Button } from "@workspace/ui/components/button"
import { useSession } from "@/lib/auth-client"
import { signOut } from "@/lib/auth-client"
import { useTheme } from "next-themes"
import { cn } from "@workspace/ui/lib/utils"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Settings04Icon, Link04Icon } from "@hugeicons-pro/core-stroke-rounded"
import { SettingsDialog } from "./settings/settings-dialog"
import { AddConnectionDialog } from "./settings/add-connection-dialog"

const themeOptions = [
  {
    label: "Light",
    value: "light",
    Icon: <HugeiconsIcon icon={Sun01Icon} className="h-4 w-4" />,
  },
  {
    label: "Dark",
    value: "dark",
    Icon: <HugeiconsIcon icon={Moon01Icon} className="h-4 w-4" />,
  },
  {
    label: "System",
    value: "system",
    Icon: <HugeiconsIcon icon={MonitorStopIcon} className="h-4 w-4" />,
  },
] as const

export function NavUser() {
  const [switchTarget, setSwitchTarget] = useState<SwitchTarget | null>(null)
  const [mounted, setMounted] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<
    "general" | "account" | "connections" | "notifications"
  >("general")
  const [addConnectionOpen, setAddConnectionOpen] = useState(false)
  const { isMobile } = useSidebar()
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
    toast.promise(signOut(), {
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
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  {conn?.picture ? (
                    <Avatar className="size-8">
                      <AvatarImage
                        src={conn.picture}
                        alt={conn.name || conn.email}
                      />
                      <AvatarFallback className="text-[10px]">
                        {(conn.name || conn.email)
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="flex size-8 items-center justify-center rounded-full border bg-sidebar-accent">
                      {ActiveConnectionIcon && (
                        <ActiveConnectionIcon className="size-4" />
                      )}
                    </div>
                  )}
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[state=collapsed]:hidden">
                    <span className="truncate font-medium">{conn?.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {conn?.email}
                    </span>
                  </div>
                  <HugeiconsIcon
                    icon={MoreHorizontalCircle01Icon}
                    className="ml-auto grid size-4 group-data-[state=collapsed]:hidden"
                  />
                </SidebarMenuButton>
              }
            />
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg bg-card"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <div className="flex items-center gap-2 text-left text-sm">
                    {conn?.picture ? (
                      <Avatar className="size-8">
                        <AvatarImage
                          src={conn.picture}
                          alt={conn.name || conn.email}
                        />
                        <AvatarFallback className="text-[10px]">
                          {(conn.name || conn.email)
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="flex size-8 items-center justify-center rounded-full border bg-sidebar-accent">
                        {ActiveConnectionIcon && (
                          <ActiveConnectionIcon className="size-4" />
                        )}
                      </div>
                    )}
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="flex items-center gap-px truncate font-medium">
                        <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-green-500 duration-2000" />
                        {conn?.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {conn?.email}
                      </span>
                    </div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuGroup>
                {otherConnections &&
                  otherConnections.map((connection) => {
                    const Icon = emailProviders.find(
                      (p) => p.providerId === connection.providerId
                    )?.icon
                    return (
                      <DropdownMenuItem
                        key={connection.id}
                        onClick={handleAccountSwitch(connection)}
                      >
                        {connection.picture ? (
                          <Avatar className="size-7">
                            <AvatarImage
                              src={connection.picture}
                              alt={connection.name || connection.email}
                            />
                            <AvatarFallback className="text-[10px]">
                              {(connection.name || connection.email)
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .toUpperCase()
                                .slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <div className="flex size-8 items-center justify-center rounded-full border bg-sidebar-accent">
                            {Icon && <Icon className="size-4" />}
                          </div>
                        )}
                        <div className="-space-y-0.5">
                          <p className="text-[12px]">
                            {connection.name || connection.email}
                          </p>
                          {connection.name && (
                            <p className="text-[11px] text-muted-foreground">
                              {connection.email.length > 25
                                ? `${connection.email.slice(0, 25)}...`
                                : connection.email}
                            </p>
                          )}
                        </div>
                      </DropdownMenuItem>
                    )
                  })}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setAddConnectionOpen(true)}>
                  <HugeiconsIcon icon={AddCircleIcon} className="h-4 w-4" />
                  Add Connection
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => {
                    setSettingsTab("general")
                    setSettingsOpen(true)
                  }}
                >
                  <HugeiconsIcon icon={Settings04Icon} className="h-4 w-4" />
                  General
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSettingsTab("connections")
                    setSettingsOpen(true)
                  }}
                >
                  <HugeiconsIcon icon={Link04Icon} className="h-4 w-4" />
                  Connections
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <div className="flex items-center justify-between pl-2">
                  <span className="text-[13px] font-medium">Appearance</span>
                  <div className="flex items-center">
                    {themeOptions.map((option, i) => (
                      <Button
                        key={option.value}
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "flex items-center justify-center p-1.5 text-accent-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                          activeTheme === option.value &&
                            "bg-muted text-accent-foreground"
                        )}
                        onClick={() => {
                          setTheme(option.value)
                        }}
                        type="button"
                      >
                        {option.Icon}
                      </Button>
                    ))}
                  </div>
                </div>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={handleLogout}>
                  <HugeiconsIcon icon={Logout01Icon} className="h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <AccountSwitchDialog
        target={switchTarget}
        onComplete={() => setSwitchTarget(null)}
      />
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        defaultTab={settingsTab}
      />
      <AddConnectionDialog
        open={addConnectionOpen}
        onOpenChange={setAddConnectionOpen}
      />
    </>
  )
}
