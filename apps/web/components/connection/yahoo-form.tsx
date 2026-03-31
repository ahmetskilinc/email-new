"use client"

import { createYahooConnection } from "@/server/actions/connections"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@workspace/ui/components/collapsible"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon } from "@hugeicons-pro/core-stroke-rounded"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

interface YahooFormProps {
  defaultEmail?: string
  onSuccess: () => void
  onBack: () => void
}

export function YahooForm({
  defaultEmail = "",
  onSuccess,
  onBack,
}: YahooFormProps) {
  const [email, setEmail] = useState(defaultEmail)
  const [password, setPassword] = useState("")
  const [isPending, setIsPending] = useState(false)
  const queryClient = useQueryClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsPending(true)
    try {
      await createYahooConnection(email, password)
      toast.success("Yahoo Mail connected successfully")
      await queryClient.invalidateQueries({ queryKey: ["activeConnection"] })
      await queryClient.invalidateQueries({ queryKey: ["connections"] })
      onSuccess()
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to connect Yahoo Mail"
      toast.error(message)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            ← Back
          </button>
        </div>
        <h3 className="text-sm font-medium">Connect Yahoo Mail</h3>
        <p className="text-muted-foreground text-sm">
          Enter your Yahoo email and app password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="yahoo-email">Yahoo Email</Label>
          <Input
            id="yahoo-email"
            type="email"
            placeholder="you@yahoo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <p className="text-muted-foreground text-xs">
            Supported: @yahoo.com, @ymail.com, @rocketmail.com
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="yahoo-password">App Password</Label>
          <Input
            id="yahoo-password"
            type="password"
            placeholder="xxxx xxxx xxxx xxxx"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <p className="text-muted-foreground text-xs">
            Don&apos;t use your Yahoo account password.
          </p>
        </div>

        <Collapsible>
          <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className="size-3.5 transition-transform group-data-[panel-open]:rotate-180"
            />
            How to generate a Yahoo app password
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[ending-style]:animate-accordion-up data-[starting-style]:animate-accordion-down">
            <ol className="mt-2 flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground [&>li]:pl-1">
              <li>1. Go to{" "}
                <a
                  href="https://login.yahoo.com/account/security"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  Yahoo Account Security
                </a>{" "}
                and sign in.
              </li>
              <li>2. Scroll down to <span className="font-medium text-foreground">Other ways to sign in</span>.</li>
              <li>3. Click <span className="font-medium text-foreground">Generate app password</span>.</li>
              <li>4. Select <span className="font-medium text-foreground">Other App</span> and enter a name like &quot;Mail App&quot;.</li>
              <li>5. Click <span className="font-medium text-foreground">Generate</span>.</li>
              <li>6. Copy the generated password and paste it above.</li>
            </ol>
            <p className="mt-2 text-[10px] text-muted-foreground/70">
              Note: You may need to enable two-factor authentication on your Yahoo account first.
            </p>
          </CollapsibleContent>
        </Collapsible>

        <Button
          type="submit"
          className="w-full"
          disabled={isPending || !email || !password}
        >
          {isPending ? "Connecting..." : "Connect Yahoo Mail"}
        </Button>
      </form>
    </div>
  )
}
