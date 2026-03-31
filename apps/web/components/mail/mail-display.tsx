"use client"

import { MailContent } from "@/components/mail/mail-content"
import { useThread } from "@/hooks/use-threads"
import { formatDate, formatTime } from "@/lib/utils"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { Separator } from "@workspace/ui/components/separator"
import { Badge } from "@workspace/ui/components/badge"
import { useQueryState } from "nuqs"
import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Label } from "@workspace/ui/components/label"
import { Input } from "@workspace/ui/components/input"

export function MailDisplay() {
  const [threadId] = useQueryState("threadId")

  const { data, isLoading } = useThread(threadId)

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

  return (
    <ScrollArea className="max-h-[calc(100dvh-(3rem+16px))] overflow-scroll">
      <div className="flex flex-col gap-4">
        {/*<div>
          <h2 className="text-lg font-semibold">
            {data.messages[0]?.subject || "(no subject)"}
          </h2>
        </div>*/}

        {data.messages.map((message) => (
          <div key={message.id} className="flex flex-col">
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {message.sender?.name || message.sender?.email}
                  </span>

                  <Popover>
                    <PopoverTrigger
                      render={
                        <Button variant="ghost" size="sm">
                          Details
                        </Button>
                      }
                    />
                    <PopoverContent className="w-80">
                      <div className="grid gap-4"></div>
                    </PopoverContent>
                  </Popover>
                </div>
                {message.to && message.to.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    To: {message.to.map((t) => t.email).join(", ")}
                  </span>
                )}
              </div>

              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDate(message.receivedOn)}
              </span>
            </div>

            {message.decodedBody && (
              <MailContent
                id={message.id}
                html={message.decodedBody}
                senderEmail={message.sender?.email ?? ""}
              />
            )}

            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {message.attachments.map((att) => (
                  <Badge key={att.attachmentId} variant="secondary">
                    {att.filename}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
