"use client"

import { Dialog, toast } from "bruv-ui"
import { useQueryClient } from "@tanstack/react-query"
import { reconnectIcloudWebSession } from "@/server/actions/connections"
import { ICloudSessionInput } from "./icloud-session-input"

interface ICloudReconnectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  connectionId: string
  email: string
  onSuccess?: () => void
}

/**
 * Re-imports an iCloud session after Apple expired the stored one.
 *
 * Separate from the add-connection flow so the account keeps its identity —
 * signatures, default-connection setting and synced mail all hang off the
 * connection row, and re-adding the account would strand them.
 */
export function ICloudReconnectDialog({
  open,
  onOpenChange,
  connectionId,
  email,
  onSuccess,
}: ICloudReconnectDialogProps) {
  const queryClient = useQueryClient()

  const handleSubmit = async (rawSession: string) => {
    try {
      await reconnectIcloudWebSession(connectionId, rawSession)
      toast.success("iCloud session updated")
      await queryClient.invalidateQueries({ queryKey: ["connections"] })
      await queryClient.invalidateQueries({ queryKey: ["activeConnection"] })
      onSuccess?.()
      onOpenChange(false)
    } catch (error: unknown) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update the iCloud session"
      )
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content className="flex w-[90vw] max-w-md flex-col gap-4 p-4">
        <div className="flex flex-col gap-2">
          <Dialog.Title className="border-none p-0 text-base font-medium leading-none">
            Reconnect iCloud Mail
          </Dialog.Title>
          <p className="text-sm text-bruv-tertiary">
            Apple ended the stored session for{" "}
            <span className="font-medium text-bruv-primary">{email}</span>. Sign
            in at icloud.com again and paste a fresh session.
          </p>
        </div>
        <ICloudSessionInput
          submitLabel="Update session"
          pendingLabel="Updating..."
          onSubmit={handleSubmit}
        />
      </Dialog.Content>
    </Dialog.Root>
  )
}
