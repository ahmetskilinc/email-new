import { ConnectionSyncer } from "@/components/connection/connection-syncer"
import { ComposeDialog } from "@/components/create/compose-dialog"
import { CommandPalette } from "@/components/command-palette"
import { SiteHeader } from "@/components/site-header"
import { AppSidebar } from "@/components/app-sidebar"
import {
  DualSidebarInset,
  DualSidebarProvider,
} from "@workspace/ui/components/dual-sidebar"
import { AppSidebarRight } from "@/components/app-sidebar-right"
import { useLocation, useNavigate, Outlet } from "react-router-dom"
import { useSession } from "@/lib/auth-client"
import { useConnections } from "@/hooks/use-connections"
import { useEffect } from "react"

export function MailLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const calendarRoute = location.pathname.startsWith("/calendar")
  const { data: session, isPending: sessionPending } = useSession()
  const { data: connections, isPending: connectionsPending } = useConnections()

  useEffect(() => {
    if (sessionPending || connectionsPending) return
    if (!session?.user) {
      navigate("/onboarding")
      return
    }
    if (!connections?.length) {
      navigate("/onboarding")
    }
  }, [session, sessionPending, connections, connectionsPending, navigate])

  if (sessionPending || connectionsPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    )
  }

  if (!session?.user) return null

  return (
    <DualSidebarProvider>
      <AppSidebar />
      <DualSidebarInset className="border border-border">
        <SiteHeader />
        <ConnectionSyncer />
        <div className="relative flex h-[calc(100dvh-(3rem+32px))] w-full flex-1 overflow-hidden">
          <Outlet />
        </div>
      </DualSidebarInset>
      {!calendarRoute && <AppSidebarRight />}
      <ComposeDialog />
      <CommandPalette />
    </DualSidebarProvider>
  )
}
