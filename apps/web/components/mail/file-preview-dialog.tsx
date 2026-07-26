"use client"

import { Dialog, Button, ScrollArea } from "bruv-ui"
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
  mimeType: string
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

  const dataUrl = useMemo(() => {
    if (!open || !attachment.body) return ""
    return `data:${attachment.mimeType};base64,${attachment.body}`
  }, [open, attachment.mimeType, attachment.body])

  const textContent = useMemo(() => {
    if (!open || previewType !== "text" || !attachment.body) return ""
    try {
      const binary = atob(attachment.body)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return new TextDecoder("utf-8").decode(bytes)
    } catch {
      return "(Unable to decode file content)"
    }
  }, [open, previewType, attachment.body])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="flex h-[80vh] max-h-[80vh] w-[90vw] max-w-4xl flex-col gap-0 overflow-hidden p-0">
        <div className="flex shrink-0 flex-row items-center justify-between gap-4 border-b border-bruv-neutral px-6 py-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Dialog.Title className="truncate border-none p-0 text-sm font-medium">
              {attachment.filename}
            </Dialog.Title>
            <p className="text-xs text-bruv-tertiary">
              {formatFileSize(attachment.size)}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onDownload}>
            Download
          </Button>
        </div>

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
              <pre className="p-6 text-sm break-all whitespace-pre-wrap">
                {textContent}
              </pre>
            </ScrollArea>
          )}

          {previewType === "unsupported" && (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-bruv-tertiary">
                Preview not available for this file type
              </p>
              <Button variant="outline" size="sm" onClick={onDownload}>
                Download to view
              </Button>
            </div>
          )}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  )
}
