"use client"

import * as React from "react"
import { Dialog, Button } from "bruv-ui"
import { CustomImapForm } from "@/components/connection/custom-imap-form"
import { ICloudForm } from "@/components/connection/icloud-form"
import { YahooForm } from "@/components/connection/yahoo-form"
import { authClient } from "@/lib/auth-client"
import { emailProviders } from "@/lib/constants"
import { toast } from "bruv-ui"

interface AddConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AddConnectionDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddConnectionDialogProps) {
  const [appPasswordProvider, setAppPasswordProvider] = React.useState<
    string | null
  >(null)
  const [isLoading, setIsLoading] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setAppPasswordProvider(null)
      setIsLoading(null)
    }
  }, [open])

  const handleProviderClick = async (providerId: string) => {
    if (
      providerId === "icloud" ||
      providerId === "yahoo" ||
      providerId === "custom"
    ) {
      setAppPasswordProvider(providerId)
      return
    }
    try {
      setIsLoading(providerId)
      await authClient.linkSocial({
        provider: providerId,
        callbackURL: window.location.href,
      })
    } catch {
      toast.error("Failed to connect account")
      setIsLoading(null)
    }
  }

  const handleAppPasswordSuccess = () => {
    setAppPasswordProvider(null)
    onSuccess?.()
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="flex w-[90vw] max-w-md flex-col gap-4 p-4">
        {appPasswordProvider === "icloud" ? (
          <ICloudForm
            defaultEmail=""
            onSuccess={handleAppPasswordSuccess}
            onBack={() => setAppPasswordProvider(null)}
          />
        ) : appPasswordProvider === "yahoo" ? (
          <YahooForm
            defaultEmail=""
            onSuccess={handleAppPasswordSuccess}
            onBack={() => setAppPasswordProvider(null)}
          />
        ) : appPasswordProvider === "custom" ? (
          <CustomImapForm
            onSuccess={handleAppPasswordSuccess}
            onBack={() => setAppPasswordProvider(null)}
          />
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Dialog.Title className="border-none p-0 text-base font-medium leading-none">
                Add Connection
              </Dialog.Title>
              <p className="text-sm text-bruv-tertiary">
                Connect an email account to start receiving mail.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {emailProviders.map((provider) => {
                const Icon = provider.icon
                return (
                  <Button
                    key={provider.providerId}
                    variant="outline"
                    className="h-20 flex-col items-center justify-center gap-2"
                    onClick={() => handleProviderClick(provider.providerId)}
                    disabled={isLoading === provider.providerId}
                  >
                    <Icon className="size-5" />
                    <span className="text-xs font-medium">
                      {isLoading === provider.providerId
                        ? "Connecting..."
                        : provider.name}
                    </span>
                  </Button>
                )
              })}
            </div>
          </>
        )}
      </Dialog.Content>
    </Dialog.Root>
  )
}
