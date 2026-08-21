"use client"

import {
  DualSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useDualSidebarWithSide,
} from "@workspace/ui/components/dual-sidebar"
import { navigationConfig, navigationConfigTopNav } from "@/config/navigation"
import { useOpenCompose } from "@/store/compose"
import { Button } from "@workspace/ui/components/button"
import { usePathname } from "next/navigation"
import { useEffect } from "react"
import Link from "next/link"
import { NavUser } from "./nav-user"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Mail02Icon,
  PencilEdit02Icon,
} from "@hugeicons-pro/core-stroke-rounded"

export function AppSidebar() {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useDualSidebarWithSide("left")
  const config = navigationConfig
  const topNavConfig = navigationConfigTopNav
  const openCompose = useOpenCompose()

  useEffect(() => {
    if (isMobile) setOpenMobile(false)
  }, [pathname, isMobile, setOpenMobile])

  return (
    <DualSidebar side="left" variant="inset" collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Mail02Icon} className="size-4" />
          <span className="block text-sm font-semibold group-data-[state=collapsed]:hidden">
            Mail
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <Button
              className="mt-2 w-full gap-2 group-data-[state=collapsed]:size-8 group-data-[state=collapsed]:p-0"
              onClick={() => openCompose()}
            >
              <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />
              <span className="group-data-[state=collapsed]:hidden">
                Compose
              </span>
            </Button>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {topNavConfig.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    render={
                      <Link href={item.href}>
                        {item.icon}
                        <span>{item.title}</span>
                      </Link>
                    }
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {config.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    render={
                      <Link href={item.href}>
                        {item.icon}
                        <span>{item.title}</span>
                      </Link>
                    }
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </DualSidebar>
  )
}
