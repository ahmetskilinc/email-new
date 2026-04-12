import { useParams, useLocation } from "react-router-dom"
import { useThreads, useThread } from "@/hooks/use-threads"
import { useState, useCallback } from "react"

export function MailFolder() {
  const { folder } = useParams<{ folder: string }>()
  const location = useLocation()
  const isAllInboxes = location.pathname.includes("all-inboxes")
  const activeFolder = folder ?? "inbox"

  const { threads, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useThreads()

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | undefined
  >()

  const { data: threadDetail, isLoading: threadLoading } = useThread(
    selectedThreadId,
    selectedConnectionId,
  )

  const handleThreadClick = useCallback(
    (thread: any) => {
      setSelectedThreadId(thread.id)
      setSelectedConnectionId(thread.connectionId)
      // Mark as read
      if (thread.$raw?.preview?.unread) {
        window.api.mail.markAsRead([thread.id], thread.connectionId)
      }
    },
    [],
  )

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Thread List */}
      <div className="flex w-80 flex-col border-r border-border">
        <div className="border-b border-border p-3">
          <h2 className="text-sm font-semibold capitalize">
            {isAllInboxes ? "All Inboxes" : activeFolder}
          </h2>
          <p className="text-xs text-muted-foreground">
            {threads.length} message{threads.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          {threads.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No messages
            </div>
          ) : (
            <>
              {threads.map((thread: any) => {
                const preview = thread.$raw?.preview
                const isSelected = thread.id === selectedThreadId
                const isUnread = preview?.unread

                return (
                  <button
                    key={thread.id}
                    onClick={() => handleThreadClick(thread)}
                    className={`w-full border-b border-border px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "bg-accent"
                        : "hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`truncate text-sm ${
                          isUnread ? "font-semibold" : "font-normal"
                        }`}
                      >
                        {preview?.sender?.name || preview?.sender?.email || "Unknown"}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {preview?.receivedOn
                          ? new Date(preview.receivedOn).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )
                          : ""}
                      </span>
                    </div>
                    <p
                      className={`mt-0.5 truncate text-xs ${
                        isUnread
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {preview?.subject || "(no subject)"}
                    </p>
                    {preview?.totalReplies > 1 && (
                      <span className="mt-0.5 inline-block rounded bg-muted px-1 text-[10px] text-muted-foreground">
                        {preview.totalReplies}
                      </span>
                    )}
                  </button>
                )
              })}

              {hasNextPage && (
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="w-full p-3 text-center text-xs text-muted-foreground hover:text-foreground"
                >
                  {isFetchingNextPage ? "Loading..." : "Load more"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Thread Detail */}
      <div className="flex flex-1 flex-col overflow-auto">
        {!selectedThreadId ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a message to read
          </div>
        ) : threadLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="size-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          </div>
        ) : threadDetail ? (
          <div className="flex flex-col">
            <div className="border-b border-border p-4">
              <h3 className="text-base font-semibold">
                {threadDetail.messages?.[0]?.subject ?? "(no subject)"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {threadDetail.messages?.length ?? 0} message
                {(threadDetail.messages?.length ?? 0) !== 1 ? "s" : ""}
              </p>
            </div>

            {threadDetail.messages?.map((msg: any, i: number) => (
              <div key={msg.id ?? i} className="border-b border-border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium">
                      {msg.sender?.name || msg.sender?.email || "Unknown"}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {msg.sender?.email}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {msg.receivedOn
                      ? new Date(msg.receivedOn).toLocaleString()
                      : ""}
                  </span>
                </div>

                {msg.processedHtml ? (
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: msg.processedHtml }}
                  />
                ) : (
                  <div className="whitespace-pre-wrap text-sm">
                    {msg.body || msg.decodedBody || "(empty)"}
                  </div>
                )}

                {msg.attachments?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {msg.attachments.map((att: any) => (
                      <div
                        key={att.attachmentId}
                        className="rounded border border-border px-2 py-1 text-xs"
                      >
                        {att.filename} ({(att.size / 1024).toFixed(1)}KB)
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Message not found
          </div>
        )}
      </div>
    </div>
  )
}
