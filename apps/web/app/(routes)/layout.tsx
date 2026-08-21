"use client"

import { ConnectionSyncer } from "@/components/connection/connection-syncer"
import { SiteHeader } from "@/components/site-header"
import { AppSidebar } from "@/components/app-sidebar"
import {
  DualSidebarInset,
  DualSidebarProvider,
} from "@workspace/ui/components/dual-sidebar"
import { AppSidebarRight } from "@/components/app-sidebar-right"
// Static: the shortcuts hook imports this module for its open atom anyway,
// so a dynamic() wrapper would not split anything out.
import { ShortcutsHelp } from "@/components/shortcuts-help"
import { usePathname } from "next/navigation"
import dynamic from "next/dynamic"

// Loaded lazily so the TipTap/novel/emoji editor stack and the settings/
// palette trees stay out of the initial bundle. The wrappers stay mounted —
// each component renders its dialog conditioned on its own store state, so
// open-state keeps working; only the code download is deferred.
const ComposeDialog = dynamic(
  () =>
    import("@/components/create/compose-dialog").then((m) => m.ComposeDialog),
  { ssr: false }
)
const SettingsDialog = dynamic(
  () =>
    import("@/components/settings/settings-dialog").then(
      (m) => m.SettingsDialog
    ),
  { ssr: false }
)
const CommandPalette = dynamic(
  () => import("@/components/command-palette").then((m) => m.CommandPalette),
  { ssr: false }
)

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
      <SettingsDialog />
      <CommandPalette />
      <ShortcutsHelp />
    </DualSidebarProvider>
  )
}
