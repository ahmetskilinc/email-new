import { MailDisplay } from "@/components/mail/mail-display"
import { MailList } from "@/components/mail/mail-list"

export const dynamic = "force-dynamic"

export default function AllInboxesPage() {
  return (
    <div className="flex h-full w-full">
      <div className="w-full max-w-sm shrink-0 border-r">
        <MailList />
      </div>
      <div className="min-w-0 flex-1">
        <MailDisplay />
      </div>
    </div>
  )
}
