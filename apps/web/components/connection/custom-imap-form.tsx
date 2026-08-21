"use client"

import { createCustomConnection } from "@/server/actions/connections"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

interface CustomImapFormProps {
  onSuccess: () => void
  onBack: () => void
}

export function CustomImapForm({ onSuccess, onBack }: CustomImapFormProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [imapHost, setImapHost] = useState("")
  const [imapPort, setImapPort] = useState("993")
  const [smtpHost, setSmtpHost] = useState("")
  const [smtpPort, setSmtpPort] = useState("587")
  const [isPending, setIsPending] = useState(false)
  const queryClient = useQueryClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsPending(true)
    try {
      await createCustomConnection(
        email,
        password,
        imapHost,
        parseInt(imapPort, 10),
        smtpHost,
        parseInt(smtpPort, 10)
      )
      toast.success("Mail account connected successfully")
      await queryClient.invalidateQueries({ queryKey: ["activeConnection"] })
      await queryClient.invalidateQueries({ queryKey: ["connections"] })
      onSuccess()
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to connect mail account"
      toast.error(message)
    } finally {
      setIsPending(false)
    }
  }

  const isValid =
    email && password && imapHost && imapPort && smtpHost && smtpPort

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </button>
        </div>
        <h3 className="text-sm font-medium">Connect via IMAP</h3>
        <p className="text-sm text-muted-foreground">
          Connect any email provider that supports IMAP/SMTP.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="custom-email">Email</Label>
          <Input
            id="custom-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="custom-password">Password</Label>
          <Input
            id="custom-password"
            type="password"
            placeholder="App password or account password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <p className="text-xs text-muted-foreground">
            If your provider supports app passwords, use one for better
            security.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="custom-imap-host">IMAP Server</Label>
            <Input
              id="custom-imap-host"
              type="text"
              placeholder="imap.example.com"
              value={imapHost}
              onChange={(e) => setImapHost(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="custom-imap-port">Port</Label>
            <Input
              id="custom-imap-port"
              type="number"
              placeholder="993"
              value={imapPort}
              onChange={(e) => setImapPort(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2 flex flex-col gap-2">
            <Label htmlFor="custom-smtp-host">SMTP Server</Label>
            <Input
              id="custom-smtp-host"
              type="text"
              placeholder="smtp.example.com"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="custom-smtp-port">Port</Label>
            <Input
              id="custom-smtp-port"
              type="number"
              placeholder="587"
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
              required
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Folders (Sent, Drafts, Trash, etc.) will be auto-detected from your
          server.
        </p>

        <Button
          type="submit"
          className="w-full"
          disabled={isPending || !isValid}
        >
          {isPending ? "Connecting..." : "Connect Account"}
        </Button>
      </form>
    </div>
  )
}
