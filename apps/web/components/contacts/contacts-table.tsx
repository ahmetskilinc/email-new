"use client"

import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PencilEdit01Icon,
  Delete02Icon,
  Tick01Icon,
  Cancel01Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import { toast } from "sonner"

interface Contact {
  id: string
  email: string
  name: string | null
  frequency: number
  lastUsed: Date
  createdAt: Date
}

export function ContactsTable({
  contacts,
  onUpdate,
  onDelete,
}: {
  contacts: Contact[]
  onUpdate: (id: string, name: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  const startEdit = (contact: Contact) => {
    setEditingId(contact.id)
    setEditName(contact.name ?? "")
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName("")
  }

  const saveEdit = async (id: string) => {
    await onUpdate(id, editName.trim())
    toast.success("Contact updated")
    setEditingId(null)
    setEditName("")
  }

  const handleDelete = async (contact: Contact) => {
    await onDelete(contact.id)
    toast.success(`Removed ${contact.email}`)
  }

  if (!contacts.length) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        No contacts found
      </div>
    )
  }

  return (
    <div className="divide-y">
      {contacts.map((contact) => (
        <div
          key={contact.id}
          className="flex items-center gap-4 px-4 py-3"
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
            {(contact.name?.[0] ?? contact.email[0])}
          </div>

          <div className="min-w-0 flex-1">
            {editingId === contact.id ? (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-7 text-sm"
                placeholder="Name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void saveEdit(contact.id).catch(() => {})
                  if (e.key === "Escape") cancelEdit()
                }}
              />
            ) : (
              <>
                <p className="truncate text-sm font-medium">
                  {contact.name || contact.email}
                </p>
                {contact.name && (
                  <p className="truncate text-xs text-muted-foreground">
                    {contact.email}
                  </p>
                )}
              </>
            )}
          </div>

          <span className="shrink-0 text-xs text-muted-foreground">
            {contact.frequency} {contact.frequency === 1 ? "email" : "emails"}
          </span>

          <div className="flex shrink-0 items-center gap-1">
            {editingId === contact.id ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void saveEdit(contact.id).catch(() => {})}
                  title="Save"
                >
                  <HugeiconsIcon icon={Tick01Icon} className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={cancelEdit}
                  title="Cancel"
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => startEdit(contact)}
                  title="Edit name"
                >
                  <HugeiconsIcon icon={PencilEdit01Icon} className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void handleDelete(contact).catch(() => {})}
                  title="Delete"
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4 text-destructive" />
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
