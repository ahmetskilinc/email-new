"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useCallback, useEffect, useRef, useState } from "react"
import { useEmailAliases } from "@/hooks/use-email-aliases"
import useComposeEditor from "@/hooks/use-compose-editor"
import { useSettings } from "@/hooks/use-settings"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Badge } from "@workspace/ui/components/badge"
import { serializeFiles } from "@/lib/schemas"
import { createDraft } from "@/server/actions/drafts"
import { formatFileSize } from "@/lib/utils"
import { EditorContent } from "@tiptap/react"
import { useQueryState } from "nuqs"
import { toast } from "sonner"
import { cn } from "@workspace/ui/lib/utils"

interface EmailComposerProps {
  initialTo?: string[]
  initialCc?: string[]
  initialBcc?: string[]
  initialSubject?: string
  initialMessage?: string
  initialAttachments?: File[]
  onSendEmail: (data: {
    to: string[]
    cc?: string[]
    bcc?: string[]
    subject: string
    message: string
    attachments: File[]
    fromEmail?: string
  }) => Promise<void>
  onClose?: () => void
  className?: string
  autofocus?: boolean
}

export function EmailComposer({
  initialTo = [],
  initialCc = [],
  initialBcc = [],
  initialSubject = "",
  initialMessage = "",
  initialAttachments = [],
  onSendEmail,
  onClose,
  className,
  autofocus = false,
}: EmailComposerProps) {
  const { data: aliases } = useEmailAliases()
  const { data: settings } = useSettings()
  const [showCc, setShowCc] = useState(initialCc.length > 0)
  const [showBcc, setShowBcc] = useState(initialBcc.length > 0)
  const [isLoading, setIsLoading] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [threadId] = useQueryState("threadId")
  const [draftId, setDraftId] = useQueryState("draftId")
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false)

  const [toValue, setToValue] = useState(initialTo.join(", "))
  const [ccValue, setCcValue] = useState(initialCc.join(", "))
  const [bccValue, setBccValue] = useState(initialBcc.join(", "))
  const [subject, setSubject] = useState(initialSubject)
  const [fromEmail, setFromEmail] = useState("")
  const [attachments, setAttachments] = useState<File[]>(initialAttachments)

  const editor = useComposeEditor({
    initialValue: initialMessage,
    isReadOnly: isLoading,
    onLengthChange: () => setHasUnsavedChanges(true),
    onModEnter: () => {
      void handleSend()
      return true
    },
    onAttachmentsChange: async (files) => {
      setAttachments((prev) => [...prev, ...files])
    },
    placeholder: "Start your email here",
    autofocus,
  })

  useEffect(() => {
    const preferred =
      settings?.settings?.defaultEmailAlias ??
      aliases?.find((a: any) => a.primary)?.email ??
      aliases?.[0]?.email
    if (preferred && fromEmail !== preferred) {
      setFromEmail(preferred)
    }
  }, [settings?.settings?.defaultEmailAlias, aliases])

  const parseRecipients = (value: string) =>
    value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

  const handleSend = async () => {
    const to = parseRecipients(toValue)
    if (to.length === 0) {
      toast.error("Recipient is required")
      return
    }
    if (!subject) {
      toast.error("Subject is required")
      return
    }

    setIsLoading(true)
    try {
      await onSendEmail({
        to,
        cc: showCc ? parseRecipients(ccValue) : undefined,
        bcc: showBcc ? parseRecipients(bccValue) : undefined,
        subject,
        message: editor?.getHTML() ?? "",
        attachments,
        fromEmail: fromEmail || undefined,
      })
      setHasUnsavedChanges(false)
      editor?.commands.clearContent(true)
      toast.success("Email sent")
    } catch {
      toast.error("Failed to send email")
    } finally {
      setIsLoading(false)
    }
  }

  const saveDraft = async () => {
    if (!hasUnsavedChanges || !editor) return
    const to = parseRecipients(toValue)
    if (!to.length || !subject) return

    try {
      const draftData = {
        to: toValue,
        cc: ccValue || undefined,
        bcc: bccValue || undefined,
        subject,
        message: editor.getHTML(),
        attachments: await serializeFiles(attachments),
        id: draftId,
        threadId: threadId || null,
        fromEmail: fromEmail || null,
      }
      const response = await createDraft(draftData)
      if (response?.id && response.id !== draftId) {
        setDraftId(response.id)
      }
      setHasUnsavedChanges(false)
    } catch {
      toast.error("Failed to save draft")
    }
  }

  useEffect(() => {
    if (!hasUnsavedChanges) return
    const timer = setTimeout(saveDraft, 3000)
    return () => clearTimeout(timer)
  }, [hasUnsavedChanges])

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
    setHasUnsavedChanges(true)
  }

  return (
    <div className={cn("flex flex-col rounded-lg border", className)}>
      <div className="flex flex-col gap-2 border-b p-3">
        <div className="flex items-center gap-2">
          <Label className="w-10 shrink-0 text-sm text-muted-foreground">
            To:
          </Label>
          <Input
            value={toValue}
            onChange={(e) => {
              setToValue(e.target.value)
              setHasUnsavedChanges(true)
            }}
            placeholder="recipient@example.com"
            disabled={isLoading}
            className="border-0 p-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex gap-1">
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowCc(!showCc)}
            >
              Cc
            </button>
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowBcc(!showBcc)}
            >
              Bcc
            </button>
          </div>
        </div>

        {showCc && (
          <div className="flex items-center gap-2">
            <Label className="w-10 shrink-0 text-sm text-muted-foreground">
              Cc:
            </Label>
            <Input
              value={ccValue}
              onChange={(e) => {
                setCcValue(e.target.value)
                setHasUnsavedChanges(true)
              }}
              placeholder="cc@example.com"
              disabled={isLoading}
              className="border-0 p-0 shadow-none focus-visible:ring-0"
            />
          </div>
        )}

        {showBcc && (
          <div className="flex items-center gap-2">
            <Label className="w-10 shrink-0 text-sm text-muted-foreground">
              Bcc:
            </Label>
            <Input
              value={bccValue}
              onChange={(e) => {
                setBccValue(e.target.value)
                setHasUnsavedChanges(true)
              }}
              placeholder="bcc@example.com"
              disabled={isLoading}
              className="border-0 p-0 shadow-none focus-visible:ring-0"
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Label className="w-10 shrink-0 text-sm text-muted-foreground">
            Sub:
          </Label>
          <Input
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value)
              setHasUnsavedChanges(true)
            }}
            placeholder="Subject"
            disabled={isLoading}
            className="border-0 p-0 shadow-none focus-visible:ring-0"
          />
        </div>

        {aliases && aliases.length > 1 && (
          <div className="flex items-center gap-2">
            <Label className="w-10 shrink-0 text-sm text-muted-foreground">
              From:
            </Label>
            <Select
              value={fromEmail}
              onValueChange={(value) => setFromEmail(value ?? "")}
            >
              <SelectTrigger className="border-0 shadow-none focus:ring-0">
                <SelectValue placeholder="Select email" />
              </SelectTrigger>
              <SelectContent>
                {aliases.map((alias: any) => (
                  <SelectItem key={alias.email} value={alias.email}>
                    {alias.name
                      ? `${alias.name} <${alias.email}>`
                      : alias.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div
        className="min-h-[200px] flex-1 cursor-text p-3"
        onClick={() => editor?.commands.focus()}
      >
        {editor && (
          <EditorContent
            editor={editor}
            className="prose prose-sm dark:prose-invert max-w-none"
          />
        )}
      </div>

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t p-3">
          {attachments.map((file, i) => (
            <Badge
              key={`${file.name}-${i}`}
              variant="secondary"
              className="gap-1"
            >
              {file.name} ({formatFileSize(file.size)})
              <button
                className="ml-1 text-xs hover:text-destructive"
                onClick={() => removeAttachment(i)}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t p-3">
        <Button onClick={handleSend} disabled={isLoading}>
          {isLoading ? "Sending..." : "Send"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
          Attach
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={(e) => {
            if (e.target.files) {
              setAttachments((prev) => [
                ...prev,
                ...Array.from(e.target.files!),
              ])
              setHasUnsavedChanges(true)
            }
          }}
        />
      </div>

      <Dialog
        open={showLeaveConfirmation}
        onOpenChange={setShowLeaveConfirmation}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard message?</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Are you sure you want to leave?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowLeaveConfirmation(false)}
            >
              Stay
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowLeaveConfirmation(false)
                onClose?.()
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
