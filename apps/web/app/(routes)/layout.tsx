import { ConnectionSyncer } from "@/components/connection/connection-syncer"
import { SiteHeader } from "@/components/site-header"
import { AppSidebar } from "@/components/app-sidebar"
import { DualSidebarInset, DualSidebarProvider } from "@workspace/ui/components/dual-sidebar"
import { AppSidebarRight } from "@/components/app-sidebar-right"

export default function RoutesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <DualSidebarProvider>
      <AppSidebar />
      <DualSidebarInset className="border border-border">
        <SiteHeader />
        <ConnectionSyncer />
        <div className="relative flex h-[calc(100dvh-3rem)] w-full flex-1 overflow-hidden">
          {children}
        </div>
      </DualSidebarInset>
      <AppSidebarRight />
    </DualSidebarProvider>
  )
}
