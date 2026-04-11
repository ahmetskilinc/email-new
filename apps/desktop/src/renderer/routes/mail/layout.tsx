import { Outlet } from "react-router-dom"

export function MailLayout() {
  return (
    <div className="flex h-screen w-full">
      {/* TODO: Port AppSidebar from apps/web */}
      <aside className="w-60 border-r border-border p-4">
        <h1 className="text-lg font-semibold">Tulli</h1>
        <nav className="mt-4 space-y-1">
          <a href="#/mail/inbox" className="block rounded px-2 py-1 text-sm hover:bg-accent">
            Inbox
          </a>
          <a href="#/mail/sent" className="block rounded px-2 py-1 text-sm hover:bg-accent">
            Sent
          </a>
          <a href="#/mail/draft" className="block rounded px-2 py-1 text-sm hover:bg-accent">
            Drafts
          </a>
          <a href="#/mail/spam" className="block rounded px-2 py-1 text-sm hover:bg-accent">
            Spam
          </a>
          <a href="#/mail/bin" className="block rounded px-2 py-1 text-sm hover:bg-accent">
            Trash
          </a>
          <a href="#/calendar" className="block rounded px-2 py-1 text-sm hover:bg-accent">
            Calendar
          </a>
        </nav>
      </aside>

      <main className="flex flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
