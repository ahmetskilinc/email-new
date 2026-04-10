"use client"

import { ConnectionSyncer } from "@/components/connection/connection-syncer"
import { ComposeDialog } from "@/components/create/compose-dialog"
import { SiteHeader } from "@/components/site-header"
import { AppSidebar } from "@/components/app-sidebar"
import {
  DualSidebarInset,
  DualSidebarProvider,
} from "@workspace/ui/components/dual-sidebar"
import { AppSidebarRight } from "@/components/app-sidebar-right"
import { usePathname } from "next/navigation"

export default function RoutesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const calendarRoute = usePathname().startsWith("/calendar")

  return (
    <DualSidebarProvider>
      <AppSidebar />
      <DualSidebarInset className="border border-border">
        <SiteHeader />
        <ConnectionSyncer />
        <div className="relative flex h-[calc(100dvh-(3rem+32px))] w-full flex-1 overflow-hidden">
          {children}
        </div>
      </DualSidebarInset>
      {!calendarRoute && <AppSidebarRight />}
      <ComposeDialog />
    </DualSidebarProvider>
  )
}
