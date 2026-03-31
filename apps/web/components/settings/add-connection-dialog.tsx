"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Button } from "@workspace/ui/components/button"
import { authClient } from "@/lib/auth-client"
import { emailProviders } from "@/lib/constants"
import { ICloudForm } from "@/components/connection/icloud-form"
import { YahooForm } from "@/components/connection/yahoo-form"
import { toast } from "sonner"

interface AddConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function AddConnectionDialog({ open, onOpenChange, onSuccess }: AddConnectionDialogProps) {
  const [appPasswordProvider, setAppPasswordProvider] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setAppPasswordProvider(null)
      setIsLoading(null)
    }
  }, [open])

  const handleProviderClick = async (providerId: string) => {
    if (providerId === "icloud" || providerId === "yahoo") {
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add Connection</DialogTitle>
              <DialogDescription>
                Connect an email account to start receiving mail.
              </DialogDescription>
            </DialogHeader>
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
                      {isLoading === provider.providerId ? "Connecting..." : provider.name}
                    </span>
                  </Button>
                )
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
