"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon } from "@hugeicons-pro/core-stroke-rounded"

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="secondary" size="sm">
            <HugeiconsIcon icon={Add01Icon} className="mr-1.5 size-4" />
            Add Contact
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
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
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isAdding || !email.trim()}>
              {isAdding ? "Adding..." : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
