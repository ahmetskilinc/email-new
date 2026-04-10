"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { formatFileSize } from "@/lib/utils"
import { useMemo } from "react"

interface FilePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  attachment: {
    attachmentId: string
    filename: string
    mimeType: string
    size: number
    body: string
  }
  onDownload: () => void
}

function getPreviewType(
  mimeType: string,
): "image" | "pdf" | "text" | "unsupported" {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType === "application/pdf") return "pdf"
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType === "application/javascript"
  )
    return "text"
  return "unsupported"
}

export function FilePreviewDialog({
  open,
  onOpenChange,
  attachment,
  onDownload,
}: FilePreviewDialogProps) {
  const previewType = getPreviewType(attachment.mimeType)
  const dataUrl = `data:${attachment.mimeType};base64,${attachment.body}`

  const textContent = useMemo(() => {
    if (previewType !== "text" || !attachment.body) return ""
    try {
      return atob(attachment.body)
    } catch {
      return "(Unable to decode file content)"
    }
  }, [previewType, attachment.body])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-h-[80vh] flex-col overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-4 border-b px-6 py-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <DialogTitle className="truncate text-sm font-medium">
              {attachment.filename}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(attachment.size)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onDownload}>
            Download
          </Button>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          {previewType === "image" && (
            <img
              src={dataUrl}
              alt={attachment.filename}
              className="max-h-full max-w-full object-contain p-4"
            />
          )}

          {previewType === "pdf" && (
            <iframe
              src={dataUrl}
              title={attachment.filename}
              className="size-full border-0"
            />
          )}

          {previewType === "text" && (
            <ScrollArea className="size-full">
              <pre className="whitespace-pre-wrap break-all p-6 text-sm">
                {textContent}
              </pre>
            </ScrollArea>
          )}

          {previewType === "unsupported" && (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Preview not available for this file type
              </p>
              <Button variant="outline" size="sm" onClick={onDownload}>
                Download to view
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
