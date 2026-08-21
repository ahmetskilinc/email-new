"use client"

import { useLabels } from "@/hooks/use-labels"
import { useMailLayout } from "@/hooks/use-mail-layout"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { useQueryState } from "nuqs"
import { MailDisplay } from "@/components/mail/mail-display"
import { MailList } from "@/components/mail/mail-list"
import { BulkActionsToolbar } from "@/components/mail/bulk-actions-toolbar"
import { Sheet, SheetContent, SheetClose } from "@workspace/ui/components/sheet"
import { Button } from "@workspace/ui/components/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon } from "@hugeicons-pro/core-stroke-rounded"

export const dynamic = "force-dynamic"

const ALLOWED_FOLDERS = new Set([
  "inbox",
  "draft",
  "sent",
  "spam",
  "bin",
  "archive",
])

function checkLabelExists(labels: any[], id: string): boolean {
  for (const label of labels) {
    if (label.id === id) return true
    if (label.labels?.length > 0 && checkLabelExists(label.labels, id))
      return true
  }
  return false
}

export default function FolderPage() {
  const params = useParams()
  const folder = params.folder as string
  const router = useRouter()

  const savedLayout = useMailLayout()
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)")
    setIsMobile(mql.matches)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])
  const layout = isMobile ? "centered" : savedLayout
  const [threadId, setThreadId] = useQueryState("threadId")
  const isStandardFolder = ALLOWED_FOLDERS.has(folder)
  const { userLabels, isLoading: isLoadingLabels } = useLabels()

  const isLabelValid = useMemo(() => {
    if (isStandardFolder) return true
    if (isLoadingLabels) return true
    if (!userLabels) return false
    return checkLabelExists(userLabels, folder)
  }, [isStandardFolder, isLoadingLabels, userLabels, folder])

  useEffect(() => {
    if (!isLabelValid) {
      const timer = setTimeout(() => router.push("/mail/inbox"), 2000)
      return () => clearTimeout(timer)
    }
  }, [isLabelValid, router])

  if (!isLabelValid) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center">
        <h2 className="text-xl font-semibold">Folder not found</h2>
        <p className="mt-2 text-muted-foreground">
          The folder you&apos;re looking for doesn&apos;t exist. Redirecting to
          inbox...
        </p>
      </div>
    )
  }

  if (layout === "centered") {
    return (
      <div className="flex h-full w-full justify-center">
        <div className="flex w-full max-w-5xl flex-col">
          <BulkActionsToolbar />
          <div className="min-h-0 flex-1">
            <MailList layout="centered" />
          </div>
        </div>
        <Sheet
          open={!!threadId}
          onOpenChange={(open) => {
            if (!open) setThreadId(null)
          }}
        >
          <SheetContent
            side="right"
            className="w-full p-0 sm:w-3/4 sm:max-w-3xl lg:min-w-4xl"
            showCloseButton={false}
          >
            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2 sm:hidden">
              <SheetClose render={<Button variant="ghost" size="icon-sm" />}>
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  strokeWidth={2}
                  className="size-4"
                />
                <span className="sr-only">Back</span>
              </SheetClose>
              <span className="truncate text-sm font-medium">
                Back to inbox
              </span>
            </div>
            <MailDisplay className="max-h-full" />
          </SheetContent>
        </Sheet>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full">
      <div className="flex w-full max-w-sm shrink-0 flex-col border-r">
        <BulkActionsToolbar />
        <div className="min-h-0 flex-1">
          <MailList />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <MailDisplay />
      </div>
    </div>
  )
}
