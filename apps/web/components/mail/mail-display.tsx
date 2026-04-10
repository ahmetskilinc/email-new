"use client"

import { MailContent } from "@/components/mail/mail-content"
import { useThread } from "@/hooks/use-threads"
import { useReplyActions } from "@/hooks/use-reply-actions"
import {
  getMessageAttachments,
  unsubscribeFromList,
} from "@/server/actions/mail"
import { useOpenCompose } from "@/store/compose"
import { formatDate, formatFileSize } from "@/lib/utils"
import { cn } from "@workspace/ui/lib/utils"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Separator } from "@workspace/ui/components/separator"
import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { useQueryState } from "nuqs"
import { useEffect, useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  MailReply01Icon,
  MailReplyAll01Icon,
  Share08Icon,
  FileDownloadIcon,
  Loading03Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import type { ParsedMessage } from "@/server/types"
import { FilePreviewDialog } from "@/components/mail/file-preview-dialog"
import { toast } from "sonner"

export function MailDisplay() {
  const [threadId] = useQueryState("threadId")
  const { data, isLoading } = useThread(threadId)
  const { handleReply, handleReplyAll, handleForward } =
    useReplyActions(threadId)
  const openCompose = useOpenCompose()

  const handleUnsubscribe = async (message: ParsedMessage) => {
    if (!message.listUnsubscribe) return
    try {
      const result = await unsubscribeFromList({
        listUnsubscribe: message.listUnsubscribe,
        listUnsubscribePost: message.listUnsubscribePost ?? undefined,
      })
      if (result.type === "email") {
        openCompose({
          to: [result.email],
          subject: result.subject || "Unsubscribe",
        })
      } else {
        toast.success("Unsubscribed successfully")
      }
    } catch {
      toast.error("Failed to unsubscribe")
    }
  }

  if (!threadId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          Select a message to read
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-48" />
        <Separator />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!data?.messages?.length) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          Message could not be loaded
        </p>
      </div>
    )
  }

  const isMultiMessage = data.messages.length > 1
  const lastMessageId = data.messages[data.messages.length - 1]?.id
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(lastMessageId ? [lastMessageId] : []),
  )

  // Reset expanded state when the thread changes
  useEffect(() => {
    const newLastId = data.messages[data.messages.length - 1]?.id
    setExpandedIds(new Set(newLastId ? [newLastId] : []))
  }, [threadId, data.messages.length])

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const stripHtml = (html: string) =>
    html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()

  return (
    <div className="flex h-full max-h-[calc(100dvh-(3rem+16px))] flex-col">
      {/* Pinned header — thread subject */}
      <div className="flex shrink-0 items-start justify-between gap-4 border-b p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {data.messages[0]?.subject}
          </span>
          <DetailsPopover message={data.messages[0]!} />
          {isMultiMessage && (
            <span className="text-xs text-muted-foreground">
              {data.messages.length} messages
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDate(data.messages[0]?.receivedOn ?? "")}
        </span>
      </div>

      {/* Scrollable body — per-message blocks */}
      <ScrollArea className="min-h-0 flex-1">
        {data.messages.map((message) => {
          const isExpanded = !isMultiMessage || expandedIds.has(message.id)

          return (
            <div
              key={message.id}
              className="flex flex-col border-b last:border-b-0"
            >
              <button
                type="button"
                onClick={() => isMultiMessage && toggleExpanded(message.id)}
                className={cn(
                  "flex items-center justify-between gap-4 bg-muted/30 px-4 py-2 text-left",
                  isMultiMessage &&
                    "cursor-pointer transition-colors hover:bg-muted/50",
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {isMultiMessage && (
                    <HugeiconsIcon
                      icon={isExpanded ? ArrowUp01Icon : ArrowDown01Icon}
                      className="size-3 shrink-0 text-muted-foreground"
                    />
                  )}
                  <span className="text-xs font-medium">
                    {message.sender?.name || message.sender?.email}
                  </span>
                  {!isExpanded && message.decodedBody && (
                    <span className="truncate text-xs text-muted-foreground">
                      {stripHtml(message.decodedBody).slice(0, 100)}
                    </span>
                  )}
                  {message.listUnsubscribe && isExpanded && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleUnsubscribe(message)
                      }}
                      className="text-xs text-muted-foreground underline hover:text-foreground"
                    >
                      Unsubscribe
                    </button>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {isExpanded && message.to && message.to.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      To: {message.to.map((t) => t.email).join(", ")}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(message.receivedOn)}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <>
                  {message.decodedBody && (
                    <MailContent
                      id={message.id}
                      html={message.decodedBody}
                      senderEmail={message.sender?.email ?? ""}
                    />
                  )}

                  {message.attachments && message.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-4 pb-2">
                      {message.attachments.map((att) => (
                        <AttachmentCard
                          key={att.attachmentId}
                          messageId={message.id}
                          attachment={att}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </ScrollArea>

      {/* Pinned footer — action buttons */}
      <div className="flex shrink-0 items-center gap-2 border-t p-4">
        <Button variant="outline" size="sm" onClick={handleReply}>
          <HugeiconsIcon icon={MailReply01Icon} data-icon="inline-start" />
          Reply
        </Button>
        <Button variant="outline" size="sm" onClick={handleReplyAll}>
          <HugeiconsIcon icon={MailReplyAll01Icon} data-icon="inline-start" />
          Reply All
        </Button>
        <Button variant="outline" size="sm" onClick={handleForward}>
          <HugeiconsIcon icon={Share08Icon} data-icon="inline-start" />
          Forward
        </Button>
      </div>
    </div>
  )
}

function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toUpperCase() ?? ""
}

function isPreviewableImage(mimeType: string): boolean {
  return mimeType.startsWith("image/")
}

function AttachmentCard({
  messageId,
  attachment,
}: {
  messageId: string
  attachment: {
    attachmentId: string
    filename: string
    mimeType: string
    size: number
    body: string
  }
}) {
  const [loading, setLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [resolvedBody, setResolvedBody] = useState(attachment.body)

  const resolveBody = async (): Promise<string | null> => {
    if (resolvedBody) return resolvedBody
    setLoading(true)
    try {
      const attachments = await getMessageAttachments(messageId)
      const match = attachments.find(
        (a) => a.attachmentId === attachment.attachmentId,
      )
      if (!match?.body) {
        toast.error("Could not load attachment")
        return null
      }
      setResolvedBody(match.body)
      return match.body
    } catch {
      toast.error("Failed to load attachment")
      return null
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    const base64 = await resolveBody()
    if (!base64) return

    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: attachment.mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = attachment.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleClick = async () => {
    const body = await resolveBody()
    if (body) setPreviewOpen(true)
  }

  const ext = getFileExtension(attachment.filename)
  const isImage =
    isPreviewableImage(attachment.mimeType) && !!resolvedBody

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="group flex w-40 flex-col overflow-hidden rounded-lg border bg-muted/30 text-left transition-colors hover:bg-muted/60"
      >
        {isImage ? (
          <div className="flex h-20 items-center justify-center overflow-hidden bg-muted">
            <img
              src={`data:${attachment.mimeType};base64,${resolvedBody}`}
              alt={attachment.filename}
              className="size-full object-cover"
            />
          </div>
        ) : (
          <div className="flex h-20 items-center justify-center bg-muted">
            <span className="text-xs font-medium text-muted-foreground uppercase">
              {ext}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 p-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-xs font-medium">
              {attachment.filename}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatFileSize(attachment.size)}
            </span>
          </div>
          {loading ? (
            <HugeiconsIcon
              icon={Loading03Icon}
              className="size-3.5 shrink-0 animate-spin text-muted-foreground"
            />
          ) : (
            <HugeiconsIcon
              icon={FileDownloadIcon}
              className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                void handleDownload()
              }}
            />
          )}
        </div>
      </button>

      {previewOpen && resolvedBody && (
        <FilePreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          attachment={{ ...attachment, body: resolvedBody }}
          onDownload={handleDownload}
        />
      )}
    </>
  )
}

function formatContact(c: { name?: string; email: string }) {
  return c.name ? `${c.name} <${c.email}>` : c.email
}

function DetailsPopover({ message }: { message: ParsedMessage }) {
  const [open, setOpen] = useState(false)

  const rows: { label: string; value: string }[] = []

  if (message.sender) {
    rows.push({ label: "From", value: formatContact(message.sender) })
  }
  if (message.to?.length) {
    rows.push({ label: "To", value: message.to.map(formatContact).join(", ") })
  }
  if (message.cc?.length) {
    rows.push({ label: "Cc", value: message.cc.map(formatContact).join(", ") })
  }
  if (message.bcc?.length) {
    rows.push({
      label: "Bcc",
      value: message.bcc.map(formatContact).join(", "),
    })
  }
  if (message.replyTo) {
    rows.push({ label: "Reply-To", value: message.replyTo })
  }
  if (message.receivedOn) {
    rows.push({
      label: "Date",
      value: new Date(message.receivedOn).toLocaleString(),
    })
  }
  if (message.subject) {
    rows.push({ label: "Subject", value: message.subject })
  }
  if (message.messageId) {
    rows.push({ label: "Message-ID", value: message.messageId })
  }
  if (message.inReplyTo) {
    rows.push({ label: "In-Reply-To", value: message.inReplyTo })
  }
  if (message.tls !== undefined) {
    rows.push({ label: "TLS", value: message.tls ? "Encrypted" : "Not encrypted" })
  }
  if (message.tags?.length) {
    rows.push({
      label: "Labels",
      value: message.tags.map((t) => t.name).join(", "),
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm">
            Details
          </Button>
        }
      />
      <PopoverContent className="w-96">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Message Details</span>
          <div className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <div key={row.label} className="flex gap-2 text-xs">
                <span className="w-20 shrink-0 font-medium text-muted-foreground">
                  {row.label}
                </span>
                <span className="min-w-0 break-all text-foreground">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
