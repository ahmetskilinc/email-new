import { MailDisplay } from "@/components/mail/mail-display"
import { MailList } from "@/components/mail/mail-list"
import { BulkActionsToolbar } from "@/components/mail/bulk-actions-toolbar"

export const dynamic = "force-dynamic"

export default function AllInboxesPage() {
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
