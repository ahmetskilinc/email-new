import { useParams, useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"

export function MailFolder() {
  const { folder } = useParams<{ folder: string }>()
  const location = useLocation()
  const isAllInboxes = location.pathname.includes("all-inboxes")
  const activeFolder = folder ?? "inbox"

  const { data, isLoading, error } = useQuery({
    queryKey: ["threads", activeFolder],
    queryFn: () =>
      isAllInboxes
        ? window.api.mail.listAllInboxes()
        : window.api.mail.listThreads(activeFolder),
  })

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <p>Failed to load messages. Please check your connection.</p>
      </div>
    )
  }

  const threads = data?.threads ?? []

  if (threads.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <p>No messages in {activeFolder}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <div className="border-b border-border p-4">
        <h2 className="text-lg font-semibold capitalize">{activeFolder}</h2>
        <p className="text-sm text-muted-foreground">
          {threads.length} message{threads.length !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="flex-1 overflow-auto">
        {threads.map((thread: any) => (
          <div
            key={thread.id}
            className="border-b border-border px-4 py-3 hover:bg-accent/50 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {thread.$raw?.preview?.sender?.name || thread.$raw?.preview?.sender?.email || "Unknown"}
              </span>
              <span className="text-xs text-muted-foreground">
                {thread.$raw?.preview?.receivedOn
                  ? new Date(thread.$raw.preview.receivedOn).toLocaleDateString()
                  : ""}
              </span>
            </div>
            <p className="text-sm text-muted-foreground truncate">
              {thread.$raw?.preview?.subject || "(no subject)"}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
