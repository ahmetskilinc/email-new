import { Outlet, useNavigate, useLocation, Link } from "react-router-dom"
import { useSession } from "@/lib/auth-client"
import { useConnections } from "@/hooks/use-connections"
import { useEffect } from "react"

const NAV_ITEMS = [
  { label: "Inbox", href: "/mail/inbox" },
  { label: "Sent", href: "/mail/sent" },
  { label: "Drafts", href: "/mail/draft" },
  { label: "Spam", href: "/mail/spam" },
  { label: "Trash", href: "/mail/bin" },
  { label: "Archive", href: "/mail/archive" },
] as const

export function MailLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: session, isPending: sessionPending } = useSession()
  const { data: connections, isPending: connectionsPending } = useConnections()

  useEffect(() => {
    if (sessionPending || connectionsPending) return

    if (!session?.user) {
      navigate("/onboarding")
      return
    }

    if (!connections?.length) {
      navigate("/onboarding")
    }
  }, [session, sessionPending, connections, connectionsPending, navigate])

  if (sessionPending || connectionsPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    )
  }

  if (!session?.user) return null

  return (
    <div className="flex h-screen w-full">
      <aside className="flex w-56 flex-col border-r border-border">
        <div className="p-4">
          <h1 className="text-lg font-semibold">Tulli</h1>
          <p className="text-xs text-muted-foreground">
            {session.user.email}
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === `#${item.href}` ||
              location.hash === `#${item.href}` ||
              location.pathname.endsWith(item.href.split("/").pop()!)
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            )
          })}

          <div className="my-2 border-t border-border" />

          <Link
            to="/mail/all-inboxes"
            className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            All Inboxes
          </Link>
          <Link
            to="/calendar"
            className="block rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          >
            Calendar
          </Link>
        </nav>
      </aside>

      <main className="flex flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
