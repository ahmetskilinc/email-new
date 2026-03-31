"use client"

import { createIcloudConnection } from "@/server/actions/connections"
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

interface ICloudFormProps {
  defaultEmail?: string
  onSuccess: () => void
  onBack: () => void
}

export function ICloudForm({
  defaultEmail = "",
  onSuccess,
  onBack,
}: ICloudFormProps) {
  const [email, setEmail] = useState(defaultEmail)
  const [password, setPassword] = useState("")
  const [isPending, setIsPending] = useState(false)
  const queryClient = useQueryClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsPending(true)
    try {
      await createIcloudConnection(email, password)
      toast.success("iCloud Mail connected successfully")
      await queryClient.invalidateQueries({ queryKey: ["activeConnection"] })
      await queryClient.invalidateQueries({ queryKey: ["connections"] })
      onSuccess()
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to connect iCloud Mail"
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
        <h3 className="text-sm font-medium">Connect iCloud Mail</h3>
        <p className="text-muted-foreground text-sm">
          Enter your iCloud email and app-specific password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="icloud-email">iCloud Email</Label>
          <Input
            id="icloud-email"
            type="email"
            placeholder="you@icloud.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <p className="text-muted-foreground text-xs">
            Supported: @icloud.com, @me.com, @mac.com
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="icloud-password">App-Specific Password</Label>
          <Input
            id="icloud-password"
            type="password"
            placeholder="xxxx-xxxx-xxxx-xxxx"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <p className="text-muted-foreground text-xs">
            Don&apos;t use your Apple ID password.
          </p>
        </div>

        <Collapsible>
          <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className="size-3.5 transition-transform group-data-[panel-open]:rotate-180"
            />
            How to generate an app-specific password
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[ending-style]:animate-accordion-up data-[starting-style]:animate-accordion-down">
            <ol className="mt-2 flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground [&>li]:pl-1">
              <li>1. Go to{" "}
                <a
                  href="https://appleid.apple.com/account/manage"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  appleid.apple.com
                </a>{" "}
                and sign in.
              </li>
              <li>2. Navigate to <span className="font-medium text-foreground">Sign-In and Security</span>.</li>
              <li>3. Click <span className="font-medium text-foreground">App-Specific Passwords</span>.</li>
              <li>4. Click the <span className="font-medium text-foreground">+</span> button to generate a new password.</li>
              <li>5. Name it something like &quot;Mail App&quot; and click <span className="font-medium text-foreground">Create</span>.</li>
              <li>6. Copy the generated password (format: xxxx-xxxx-xxxx-xxxx) and paste it above.</li>
            </ol>
          </CollapsibleContent>
        </Collapsible>

        <Button
          type="submit"
          className="w-full"
          disabled={isPending || !email || !password}
        >
          {isPending ? "Connecting..." : "Connect iCloud Mail"}
        </Button>
      </form>
    </div>
  )
}
