"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { useComposeDialog } from "@/store/compose"
import { EmailComposer } from "./email-composer"
import { sendMail } from "@/server/actions/mail"
import { serializeFiles } from "@/lib/schemas"
import { useSettings } from "@/hooks/use-settings"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

const UNDO_SEND_DELAY_MS = 5000

interface SendPayload {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  message: string
  attachments: File[]
  fromEmail?: string
  signatureId?: string
  threadId?: string
  headers?: Record<string, string>
}

/**
 * Draft state restored into the composer after an Undo or a failed send.
 * Kept locally (not in the compose store) so File attachments survive.
 */
interface RestoredDraft {
  key: number
  payload: SendPayload
}

export function ComposeDialog() {
  const [{ open, initialData }, setOpen] = useComposeDialog()
  const { data: settingsData } = useSettings()
  const undoSendEnabled = settingsData?.settings?.undoSendEnabled ?? false

  const [restored, setRestored] = useState<RestoredDraft | null>(null)
  const restoredKeyRef = useRef(0)
  const closeGuardRef = useRef<(() => boolean) | null>(null)
  // One entry per in-flight undo window; several sends can be pending at once,
  // and each Undo must cancel only its own timer.
  const pendingSendsRef = useRef(
    new Map<ReturnType<typeof setTimeout>, SendPayload>()
  )

  // A reply arriving while a restored draft is showing must win — otherwise
  // the restored payload shadows the new reply's recipients/thread.
  useEffect(() => {
    if (initialData) setRestored(null)
  }, [initialData])

  // The dialog lives at layout level, so this only runs on route teardown
  // (sign-out, leaving the route group). The user already saw "Sending…", so
  // flush pending sends immediately instead of silently dropping them.
  useEffect(
    () => () => {
      for (const [timer, payload] of pendingSendsRef.current) {
        clearTimeout(timer)
        void doSend(payload).catch((err) => {
          console.error("[compose] flush-on-unmount send failed", err)
        })
      }
      pendingSendsRef.current.clear()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const doSend = async (payload: SendPayload) => {
    const serializedAttachments = await serializeFiles(payload.attachments)
    await sendMail({
      to: payload.to.map((email) => ({ email })),
      cc: payload.cc?.map((email) => ({ email })),
      bcc: payload.bcc?.map((email) => ({ email })),
      subject: payload.subject,
      message: payload.message,
      attachments: serializedAttachments,
      fromEmail: payload.fromEmail,
      signatureId: payload.signatureId,
      threadId: payload.threadId,
      headers: payload.headers,
    })
  }

  const restoreDraft = (payload: SendPayload) => {
    restoredKeyRef.current += 1
    setRestored({ key: restoredKeyRef.current, payload })
    setOpen(true)
  }

  const closeDialog = () => {
    setOpen(false)
    setRestored(null)
  }

  const sendWithResultToast = (payload: SendPayload) => {
    void doSend(payload)
      .then(() => {
        toast.success("Email sent")
      })
      .catch(() => {
        toast.error("Failed to send email", {
          action: {
            label: "Restore draft",
            onClick: () => restoreDraft(payload),
          },
        })
      })
  }

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
    const payload: SendPayload = {
      ...data,
      threadId: restored?.payload.threadId ?? initialData?.threadId,
      headers: restored?.payload.headers ?? initialData?.headers,
    }

    // Close optimistically either way — the dialog must not freeze while the
    // provider round-trip runs; results surface as toasts.
    closeDialog()

    if (!undoSendEnabled) {
      sendWithResultToast(payload)
      return
    }

    const timer = setTimeout(() => {
      pendingSendsRef.current.delete(timer)
      sendWithResultToast(payload)
    }, UNDO_SEND_DELAY_MS)
    pendingSendsRef.current.set(timer, payload)

    const toastId = toast(`Sending in ${UNDO_SEND_DELAY_MS / 1000}s…`, {
      duration: UNDO_SEND_DELAY_MS,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(timer)
          pendingSendsRef.current.delete(timer)
          toast.dismiss(toastId)
          restoreDraft(payload)
        },
      },
    })
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setOpen(true)
      return
    }
    // Closing via X / Escape / overlay: let the composer veto when there are
    // unsaved changes — it opens its discard confirmation instead.
    if (closeGuardRef.current && !closeGuardRef.current()) return
    closeDialog()
  }

  const title =
    (restored?.payload.threadId ?? initialData?.threadId)
      ? "Reply"
      : "New Message"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <EmailComposer
          key={
            open
              ? restored
                ? `restored-${restored.key}`
                : JSON.stringify(initialData)
              : "closed"
          }
          initialTo={restored?.payload.to ?? initialData?.to}
          initialCc={restored?.payload.cc ?? initialData?.cc}
          initialBcc={restored?.payload.bcc ?? initialData?.bcc}
          initialSubject={restored?.payload.subject ?? initialData?.subject}
          initialMessage={restored?.payload.message ?? initialData?.message}
          initialAttachments={restored?.payload.attachments}
          onSendEmail={handleSend}
          onClose={closeDialog}
          closeGuardRef={closeGuardRef}
          toastOnSend={false}
          autofocus
        />
      </DialogContent>
    </Dialog>
  )
}
