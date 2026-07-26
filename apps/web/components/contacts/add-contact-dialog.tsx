"use client"

import { useState } from "react"
import { Dialog, Button, Input, Label } from "bruv-ui"
import { PlusIcon } from "@heroicons/react/16/solid"

export function AddContactDialog({
  onAdd,
  isAdding,
}: {
  onAdd: (email: string, name?: string) => Promise<boolean>
  isAdding: boolean
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    const success = await onAdd(email.trim(), name.trim() || undefined)
    if (success) {
      setEmail("")
      setName("")
      setOpen(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={
          <Button variant="secondary" size="sm" iconLeft={<PlusIcon />}>
            Add Contact
          </Button>
        }
      />
      <Dialog.Content className="flex w-[90vw] max-w-md flex-col gap-4 p-4">
        <Dialog.Title className="border-none p-0 text-base font-medium leading-none">
          Add Contact
        </Dialog.Title>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-email">Email</Label>
            <Input
              id="contact-email"
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-name">Name (optional)</Label>
            <Input
              id="contact-name"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="transparent"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isAdding || !email.trim()}
            >
              {isAdding ? "Adding..." : "Add"}
            </Button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  )
}
