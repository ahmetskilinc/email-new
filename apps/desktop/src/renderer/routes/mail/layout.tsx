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
  // useConnections has `enabled: !!userId`, and react-query v5 reports
  // isPending=true for disabled queries — so we can't gate on it before
  // knowing there's a user. Check session first, then gate on connections
  // only once the user is known.
  const {
    data: connections,
    isPending: connectionsPending,
    isFetched: connectionsFetched,
  } = useConnections()

  useEffect(() => {
    if (sessionPending) return
    if (!session?.user) {
      navigate("/onboarding")
      return
    }
    // User exists — wait for connections to finish loading before deciding.
    if (!connectionsFetched) return
    if (!connections?.length) {
      navigate("/onboarding")
    }
  }, [session, sessionPending, connections, connectionsFetched, navigate])

  if (sessionPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    )
  }

  if (!session?.user) return null

  if (connectionsPending && !connectionsFetched) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    )
  }

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
