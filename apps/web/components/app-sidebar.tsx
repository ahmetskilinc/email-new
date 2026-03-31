"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { navigationConfig, navigationConfigTopNav } from "@/config/navigation"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { NavUser } from "./nav-user"
import { HugeiconsIcon } from "@hugeicons/react"
import { Mail02Icon } from "@hugeicons-pro/core-stroke-rounded"

export function AppSidebar() {
  const pathname = usePathname()
  const config = navigationConfig
  const topNavConfig = navigationConfigTopNav

  return (
    <Sidebar variant="inset" collapsible="icon">
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
    </Sidebar>
  )
}
