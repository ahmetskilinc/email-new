"use client"

import { useState } from "react"
import { useContacts } from "@/hooks/use-contacts"
import { ContactsTable } from "@/components/contacts/contacts-table"
import { AddContactDialog } from "@/components/contacts/add-contact-dialog"
import { Input } from "@workspace/ui/components/input"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons-pro/core-stroke-rounded"
import { toast } from "sonner"

export default function ContactsPage() {
  const [search, setSearch] = useState("")
  const query = search.length >= 2 ? search : undefined
  const { contacts, isLoading, create, update, remove, isCreating } =
    useContacts(query)

  const handleAdd = async (email: string, name?: string) => {
    try {
      await create({ email, name })
      toast.success("Contact added")
    } catch {
      toast.error("Failed to add contact")
    }
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3">
        <h1 className="text-sm font-semibold">Contacts</h1>
        <AddContactDialog onAdd={handleAdd} isAdding={isCreating} />
      </div>

      <div className="shrink-0 border-b px-4 py-2">
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-9 text-sm"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="size-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          </div>
        ) : (
          <ContactsTable
            contacts={contacts}
            onUpdate={async (id, name) => {
              try {
                await update({ id, name })
              } catch {
                toast.error("Failed to update contact")
              }
            }}
            onDelete={async (id) => {
              try {
                await remove(id)
              } catch {
                toast.error("Failed to delete contact")
              }
            }}
          />
        )}
      </ScrollArea>
    </div>
  )
}
