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
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { useCallback, useEffect, useRef, useState } from "react"
import { useEmailAliases } from "@/hooks/use-email-aliases"
import { useConnections } from "@/hooks/use-connections"
import { useSignatures } from "@/hooks/use-signatures"
import useComposeEditor from "@/hooks/use-compose-editor"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSettings } from "@/hooks/use-settings"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { serializeFiles } from "@/lib/schemas"
import { createDraft } from "@/server/actions/drafts"
import { formatFileSize } from "@/lib/utils"
import { AnimatePresence, motion } from "motion/react"
import { EditorContent } from "@tiptap/react"
import { useForm } from "react-hook-form"
import { useQueryState } from "nuqs"
import { toast } from "sonner"
import { cn } from "@workspace/ui/lib/utils"
import { z } from "zod"
import { X } from "@hugeicons-pro/core-stroke-rounded"
import { HugeiconsIcon } from "@hugeicons/react"

const composeSchema = z.object({
  to: z.string().min(1, "Recipient is required"),
  cc: z.string(),
  bcc: z.string(),
  subject: z.string().min(1, "Subject is required"),
  fromEmail: z.string(),
})

type ComposeFormValues = z.infer<typeof composeSchema>

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
    signatureId?: string
  }) => Promise<void>
  onClose?: () => void
  className?: string
  autofocus?: boolean
}

function parseRecipients(value: string) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
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
  const { data: connectionsData } = useConnections()
  const connections = connectionsData?.connections ?? []
  const [showCc, setShowCc] = useState(initialCc.length > 0)
  const [showBcc, setShowBcc] = useState(initialBcc.length > 0)
  const [selectedSignatureId, setSelectedSignatureId] = useState<string | null>(
    null,
  )
  const [showLeaveConfirmation, setShowLeaveConfirmation] = useState(false)
  const [attachments, setAttachments] = useState<File[]>(initialAttachments)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [threadId] = useQueryState("threadId")
  const [draftId, setDraftId] = useQueryState("draftId")

  const form = useForm<ComposeFormValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      to: initialTo.join(", "),
      cc: initialCc.join(", "),
      bcc: initialBcc.join(", "),
      subject: initialSubject,
      fromEmail: "",
    },
  })

  const { register, handleSubmit, watch, setValue, formState } = form
  const { errors, isSubmitting, isDirty } = formState
  const currentFromEmail = watch("fromEmail")

  const activeConnectionId =
    connections.find(
      (c) => c.email.toLowerCase() === currentFromEmail?.toLowerCase(),
    )?.id ?? connections[0]?.id ?? null

  const { data: signatures } = useSignatures(activeConnectionId)

  useEffect(() => {
    if (!signatures?.length) {
      setSelectedSignatureId(null)
      return
    }
    const defaultSig = signatures.find((s) => s.isDefault)
    setSelectedSignatureId(defaultSig?.id ?? null)
  }, [signatures])

  const selectedSignature = signatures?.find(
    (s) => s.id === selectedSignatureId,
  )

  const editor = useComposeEditor({
    initialValue: initialMessage,
    isReadOnly: isSubmitting,
    onLengthChange: () => {},
    onModEnter: () => {
      void handleSubmit(onSubmit)()
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
    if (preferred) {
      setValue("fromEmail", preferred)
    }
  }, [settings?.settings?.defaultEmailAlias, aliases, setValue])

  const onSubmit = async (data: ComposeFormValues) => {
    try {
      await onSendEmail({
        to: parseRecipients(data.to),
        cc: showCc ? parseRecipients(data.cc ?? "") : undefined,
        bcc: showBcc ? parseRecipients(data.bcc ?? "") : undefined,
        subject: data.subject,
        message: editor?.getHTML() ?? "",
        attachments,
        fromEmail: data.fromEmail || undefined,
        signatureId: selectedSignatureId || undefined,
      })
      form.reset()
      editor?.commands.clearContent(true)
      toast.success("Email sent")
    } catch {
      toast.error("Failed to send email")
    }
  }

  const watchedValues = watch()

  useEffect(() => {
    if (!isDirty || !editor) return
    const timer = setTimeout(async () => {
      const to = parseRecipients(watchedValues.to)
      if (!to.length || !watchedValues.subject) return

      try {
        const draftData = {
          to: watchedValues.to,
          cc: watchedValues.cc || undefined,
          bcc: watchedValues.bcc || undefined,
          subject: watchedValues.subject,
          message: editor.getHTML(),
          attachments: await serializeFiles(attachments),
          id: draftId,
          threadId: threadId || null,
          fromEmail: watchedValues.fromEmail || null,
        }
        const response = await createDraft(draftData)
        if (response?.id && response.id !== draftId) {
          setDraftId(response.id)
        }
      } catch {
        toast.error("Failed to save draft")
      }
    }, 3000)
    return () => clearTimeout(timer)
  }, [
    isDirty,
    watchedValues,
    editor,
    attachments,
    draftId,
    threadId,
    setDraftId,
  ])

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={cn(className)}>
      <FieldGroup className="gap-2 border-b p-3">
        <Field
          orientation="horizontal"
          data-invalid={!!errors.to || undefined}
          className="pr-8"
        >
          <FieldLabel className="w-8 flex-none! shrink-0 text-sm text-muted-foreground">
            To:
          </FieldLabel>
          <Input
            {...register("to")}
            placeholder="recipient@example.com"
            disabled={isSubmitting}
            aria-invalid={!!errors.to}
          />
          <div className="flex shrink-0 gap-4">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowCc(!showCc)}
            >
              Cc
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowBcc(!showBcc)}
            >
              Bcc
            </button>
          </div>
          {errors.to && <FieldError>{errors.to.message}</FieldError>}
        </Field>

        {showCc && (
          <Field orientation="horizontal">
            <FieldLabel className="w-8 flex-none! shrink-0 text-sm text-muted-foreground">
              Cc:
            </FieldLabel>
            <Input
              {...register("cc")}
              placeholder="cc@example.com"
              disabled={isSubmitting}
            />
          </Field>
        )}

        {showBcc && (
          <Field orientation="horizontal">
            <FieldLabel className="w-8 flex-none! shrink-0 text-sm text-muted-foreground">
              Bcc:
            </FieldLabel>
            <Input
              {...register("bcc")}
              placeholder="bcc@example.com"
              disabled={isSubmitting}
            />
          </Field>
        )}

        <Field
          orientation="horizontal"
          data-invalid={!!errors.subject || undefined}
        >
          <FieldLabel className="w-8 flex-none! shrink-0 text-sm text-muted-foreground">
            Sub:
          </FieldLabel>
          <Input
            {...register("subject")}
            placeholder="Subject"
            disabled={isSubmitting}
            aria-invalid={!!errors.subject}
          />
          {errors.subject && <FieldError>{errors.subject.message}</FieldError>}
        </Field>

        {aliases && aliases.length > 1 && (
          <Field orientation="horizontal">
            <FieldLabel className="w-8 flex-none! shrink-0 text-sm text-muted-foreground">
              From:
            </FieldLabel>
            <Select
              value={currentFromEmail}
              onValueChange={(value) => setValue("fromEmail", value ?? "")}
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
          </Field>
        )}

        {signatures && signatures.length > 0 && (
          <Field orientation="horizontal">
            <FieldLabel className="w-8 flex-none! shrink-0 text-sm text-muted-foreground">
              Sig:
            </FieldLabel>
            <Select
              value={selectedSignatureId ?? "__none__"}
              onValueChange={(value) =>
                setSelectedSignatureId(
                  value === "__none__" ? null : value,
                )
              }
            >
              <SelectTrigger className="border-0 shadow-none focus:ring-0">
                <SelectValue placeholder="No signature" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {signatures.map((sig) => (
                  <SelectItem key={sig.id} value={sig.id}>
                    {sig.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </FieldGroup>

      <div
        className="min-h-[340px] flex-1 cursor-text p-3"
        onClick={() => editor?.commands.focus()}
      >
        {editor && (
          <EditorContent
            editor={editor}
            className="prose prose-sm dark:prose-invert max-w-none"
          />
        )}
        {selectedSignature && (
          <div className="mt-4 border-t border-dashed pt-3 text-xs text-muted-foreground whitespace-pre-wrap">
            --
            {"\n"}
            {selectedSignature.body}
          </div>
        )}
      </div>

      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden border-t"
          >
            <div className="flex flex-wrap gap-2 p-3">
              <AnimatePresence mode="popLayout">
                {attachments.map((file, i) => (
                  <motion.div
                    key={`${file.name}-${file.size}-${i}`}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                  >
                    <AttachmentPreview
                      file={file}
                      onRemove={() => removeAttachment(i)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 border-t p-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending..." : "Send"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSubmitting}
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
              type="button"
              variant="secondary"
              onClick={() => setShowLeaveConfirmation(false)}
            >
              Stay
            </Button>
            <Button
              type="button"
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
    </form>
  )
}

function AttachmentPreview({
  file,
  onRemove,
}: {
  file: File
  onRemove: () => void
}) {
  const isImage = file.type.startsWith("image/")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!isImage) return
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file, isImage])

  return (
    <div className="group relative flex w-32 flex-col overflow-hidden rounded-lg border bg-muted/30">
      {previewUrl ? (
        <div className="flex h-36 items-center justify-center overflow-hidden bg-muted">
          <img
            src={previewUrl}
            alt={file.name}
            className="size-full object-cover"
          />
        </div>
      ) : (
        <div className="flex h-20 items-center justify-center bg-muted">
          <span className="text-xs font-medium text-muted-foreground uppercase">
            {file.name.split(".").pop()}
          </span>
        </div>
      )}
      <div className="flex flex-col gap-0.5 p-2">
        <span className="truncate text-xs font-medium">{file.name}</span>
        <span className="text-xs text-muted-foreground">
          {formatFileSize(file.size)}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-background/80 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
      >
        <HugeiconsIcon icon={X} data-icon="inline-start" className="size-3" />
      </button>
    </div>
  )
}
