"use client"

import { EmailComposer } from "@/components/create/email-composer"
import { sendMail } from "@/server/actions/mail"
import { useSearchParams, useRouter } from "next/navigation"
import { serializeFiles } from "@/lib/schemas"
import { useQueryState } from "nuqs"
import { toast } from "sonner"

export function ComposeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [draftId] = useQueryState("draftId")

  const to = searchParams.get("to") || ""
  const subject = searchParams.get("subject") || ""
  const body = searchParams.get("body") || ""
  const cc = searchParams.get("cc") || ""
  const bcc = searchParams.get("bcc") || ""

  const handleSend = async (data: {
    to: string[]
    cc?: string[]
    bcc?: string[]
    subject: string
    message: string
    attachments: File[]
    fromEmail?: string
  }) => {
    const serializedAttachments = await serializeFiles(data.attachments)

    await sendMail({
      to: data.to.map((email) => ({ email })),
      cc: data.cc?.map((email) => ({ email })),
      bcc: data.bcc?.map((email) => ({ email })),
      subject: data.subject,
      message: data.message,
      attachments: serializedAttachments,
      fromEmail: data.fromEmail,
      draftId: draftId ?? undefined,
    })

    router.push("/mail/inbox")
  }

  return (
    <div className="flex h-full w-full items-start justify-center p-4">
      <EmailComposer
        initialTo={to ? to.split(",") : []}
        initialSubject={subject}
        initialMessage={body}
        initialCc={cc ? cc.split(",") : []}
        initialBcc={bcc ? bcc.split(",") : []}
        onSendEmail={handleSend}
        onClose={() => router.push("/mail/inbox")}
        className="w-full max-w-2xl"
        autofocus
      />
    </div>
  )
}
