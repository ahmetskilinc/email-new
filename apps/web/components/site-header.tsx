"use client"

import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { Separator } from "@workspace/ui/components/separator"
import { useParams } from "next/navigation"

export function SiteHeader() {
  const params = useParams<{ folder?: string }>()
  const folder = params?.folder ?? "inbox"

  const title = folder.charAt(0).toUpperCase() + folder.slice(1)

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-2" />
      <Separator orientation="vertical" className="mr-2" />
      <h1 className="text-sm font-medium">{title}</h1>
    </header>
  )
}
