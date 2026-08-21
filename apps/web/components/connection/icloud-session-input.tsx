"use client"

import { Button, Collapsible, Label, Textarea } from "bruv-ui"
import { ChevronDownIcon } from "@heroicons/react/16/solid"
import { useState } from "react"

interface ICloudSessionInputProps {
  submitLabel: string
  pendingLabel: string
  onSubmit: (rawSession: string) => Promise<void>
}

/**
 * Captured-session field shared by the connect and reconnect flows.
 *
 * The session is pasted rather than collected through an Apple ID password
 * prompt on purpose: the app should never hold the user's Apple Account
 * password, and Apple's own login and 2FA belong in Apple's UI.
 */
export function ICloudSessionInput({
  submitLabel,
  pendingLabel,
  onSubmit,
}: ICloudSessionInputProps) {
  const [rawSession, setRawSession] = useState("")
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsPending(true)
    try {
      await onSubmit(rawSession)
      setRawSession("")
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="icloud-session">iCloud session</Label>
        <Textarea
          id="icloud-session"
          rows={5}
          placeholder="X-APPLE-WEBAUTH-TOKEN=…; X-APPLE-WEBAUTH-USER=…"
          value={rawSession}
          onChange={(e) => setRawSession(e.target.value)}
          required
          spellCheck={false}
          autoComplete="off"
          className="font-mono text-xs"
        />
        <p className="text-xs text-bruv-tertiary">
          Paste the <span className="font-medium">Cookie</span> header from a
          signed-in icloud.com request, or a JSON cookie export.
        </p>
      </div>

      <div className="rounded-bruv-lg border border-bruv-warn/40 bg-bruv-warn/5 p-3 text-xs text-bruv-tertiary">
        <p className="font-medium text-bruv-primary">
          This session is a powerful credential.
        </p>
        <p className="mt-1">
          It signs in as you on iCloud.com and may reach more of your Apple
          account than Mail. It is encrypted before storage and never sent back
          to the browser, but you should sign the session out from{" "}
          <a
            href="https://appleid.apple.com/account/manage"
            target="_blank"
            rel="noopener noreferrer"
            className="text-bruv-accent underline underline-offset-2"
          >
            appleid.apple.com
          </a>{" "}
          if you disconnect this account. Apple does not support this API for
          third-party apps and may invalidate the session at any time.
        </p>
      </div>

      <Collapsible.Root>
        <Collapsible.Trigger className="group flex w-full items-center gap-1.5 text-xs font-medium text-bruv-accent hover:underline">
          <ChevronDownIcon className="size-3.5 transition-transform group-data-[panel-open]:rotate-180" />
          How to copy your iCloud session
        </Collapsible.Trigger>
        <Collapsible.Panel className="overflow-hidden">
          <ol className="mt-2 flex flex-col gap-1.5 rounded-bruv-lg border bg-bruv-subtle/30 p-3 text-xs text-bruv-tertiary [&>li]:pl-1">
            <li>
              1. Sign in at{" "}
              <a
                href="https://www.icloud.com/mail"
                target="_blank"
                rel="noopener noreferrer"
                className="text-bruv-accent underline underline-offset-2"
              >
                icloud.com/mail
              </a>{" "}
              and complete two-factor authentication.
            </li>
            <li>
              2. Open your browser&apos;s developer tools and select the{" "}
              <span className="font-medium text-bruv-primary">Network</span>{" "}
              tab.
            </li>
            <li>
              3. Filter requests for{" "}
              <span className="font-mono text-bruv-primary">mailws</span> and
              click any request that appears.
            </li>
            <li>
              4. Under{" "}
              <span className="font-medium text-bruv-primary">
                Request Headers
              </span>
              , copy the full value of the{" "}
              <span className="font-mono text-bruv-primary">Cookie</span>{" "}
              header.
            </li>
            <li>5. Paste it above.</li>
          </ol>
        </Collapsible.Panel>
      </Collapsible.Root>

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={isPending || !rawSession.trim()}
      >
        {isPending ? pendingLabel : submitLabel}
      </Button>
    </form>
  )
}
