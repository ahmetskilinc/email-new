"use client"

import {
  createIcloudConnection,
  createIcloudWebSessionConnection,
  icloudWebServiceAvailable,
} from "@/server/actions/connections"
import { Button, Input, Label, Collapsible } from "bruv-ui"
import { ChevronDownIcon } from "@heroicons/react/16/solid"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { toast } from "bruv-ui"
import { ICloudSessionInput } from "./icloud-session-input"

interface ICloudFormProps {
  defaultEmail?: string
  onSuccess: () => void
  onBack: () => void
}

type ICloudAuthMode = "session" | "app-password"

export function ICloudForm({
  defaultEmail = "",
  onSuccess,
  onBack,
}: ICloudFormProps) {
  const [email, setEmail] = useState(defaultEmail)
  const [password, setPassword] = useState("")
  const [isPending, setIsPending] = useState(false)
  const [mode, setMode] = useState<ICloudAuthMode>("session")
  const queryClient = useQueryClient()

  // The web-service path is a deployment-level choice, so ask the server
  // rather than assuming; with it disabled, only the app-password form shows.
  const { data: webServiceEnabled, isPending: checkingFlag } = useQuery({
    queryKey: ["icloudWebServiceAvailable"],
    queryFn: () => icloudWebServiceAvailable(),
    staleTime: Infinity,
  })

  useEffect(() => {
    if (webServiceEnabled === false) setMode("app-password")
  }, [webServiceEnabled])

  const refreshConnections = async () => {
    await queryClient.invalidateQueries({ queryKey: ["activeConnection"] })
    await queryClient.invalidateQueries({ queryKey: ["connections"] })
  }

  const handleSessionSubmit = async (rawSession: string) => {
    try {
      const result = await createIcloudWebSessionConnection(rawSession)
      toast.success(`Connected ${result.email} over the iCloud web service`)
      await refreshConnections()
      onSuccess()
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to connect iCloud Mail"
      )
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsPending(true)
    try {
      await createIcloudConnection(email, password)
      toast.success("iCloud Mail connected successfully")
      await refreshConnections()
      onSuccess()
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to connect iCloud Mail"
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
            className="text-sm text-bruv-tertiary hover:text-bruv-primary"
          >
            ← Back
          </button>
        </div>
        <h3 className="text-sm font-medium">Connect iCloud Mail</h3>
        <p className="text-sm text-bruv-tertiary">
          {mode === "session"
            ? "Connect through the same web service iCloud.com Mail uses."
            : "Enter your iCloud email and app-specific password."}
        </p>
      </div>

      {webServiceEnabled && !checkingFlag && (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "session" ? "primary" : "outline"}
            className="flex-1"
            onClick={() => setMode("session")}
          >
            iCloud session
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "app-password" ? "primary" : "outline"}
            className="flex-1"
            onClick={() => setMode("app-password")}
          >
            App password
          </Button>
        </div>
      )}

      {mode === "session" ? (
        <ICloudSessionInput
          submitLabel="Connect iCloud Mail"
          pendingLabel="Connecting..."
          onSubmit={handleSessionSubmit}
        />
      ) : (
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
            <p className="text-xs text-bruv-tertiary">
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
            <p className="text-xs text-bruv-tertiary">
              Don&apos;t use your Apple ID password.
            </p>
          </div>

          <Collapsible.Root>
            <Collapsible.Trigger className="group flex w-full items-center gap-1.5 text-xs font-medium text-bruv-accent hover:underline">
              <ChevronDownIcon className="size-3.5 transition-transform group-data-[panel-open]:rotate-180" />
              How to generate an app-specific password
            </Collapsible.Trigger>
            <Collapsible.Panel className="overflow-hidden">
              <ol className="mt-2 flex flex-col gap-1.5 rounded-bruv-lg border bg-bruv-subtle/30 p-3 text-xs text-bruv-tertiary [&>li]:pl-1">
                <li>
                  1. Go to{" "}
                  <a
                    href="https://appleid.apple.com/account/manage"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-bruv-accent underline underline-offset-2"
                  >
                    appleid.apple.com
                  </a>{" "}
                  and sign in.
                </li>
                <li>
                  2. Navigate to{" "}
                  <span className="font-medium text-bruv-primary">
                    Sign-In and Security
                  </span>
                  .
                </li>
                <li>
                  3. Click{" "}
                  <span className="font-medium text-bruv-primary">
                    App-Specific Passwords
                  </span>
                  .
                </li>
                <li>
                  4. Click the{" "}
                  <span className="font-medium text-bruv-primary">+</span>{" "}
                  button to generate a new password.
                </li>
                <li>
                  5. Name it something like &quot;Mail App&quot; and click{" "}
                  <span className="font-medium text-bruv-primary">Create</span>.
                </li>
                <li>
                  6. Copy the generated password (format: xxxx-xxxx-xxxx-xxxx)
                  and paste it above.
                </li>
              </ol>
            </Collapsible.Panel>
          </Collapsible.Root>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={isPending || !email || !password}
          >
            {isPending ? "Connecting..." : "Connect iCloud Mail"}
          </Button>
        </form>
      )}
    </div>
  )
}
