import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { useComposeDialog } from "@/store/compose"
import { EmailComposer } from "./email-composer"
import { sendMail } from "@/lib/api"
import { serializeFiles } from "@/lib/schemas"

export function ComposeDialog() {
  const [{ open, initialData }, setOpen] = useComposeDialog()

  const handleSend = async (data: {
    to: string[]
    cc?: string[]
    bcc?: string[]
    subject: string
    message: string
    attachments: File[]
    fromEmail?: string
    signatureId?: string
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
      signatureId: data.signatureId,
      threadId: initialData?.threadId,
      headers: initialData?.headers,
    })

    setOpen(false)
  }

  const title = initialData?.threadId ? "Reply" : "New Message"

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90dvh] overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <EmailComposer
          key={open ? JSON.stringify(initialData) : "closed"}
          initialTo={initialData?.to}
          initialCc={initialData?.cc}
          initialBcc={initialData?.bcc}
          initialSubject={initialData?.subject}
          initialMessage={initialData?.message}
          onSendEmail={handleSend}
          onClose={() => setOpen(false)}
          autofocus
        />
      </DialogContent>
    </Dialog>
  )
}
