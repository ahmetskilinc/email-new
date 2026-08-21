"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reconnect iCloud Mail</DialogTitle>
          <DialogDescription>
            Apple ended the stored session for{" "}
            <span className="font-medium text-foreground">{email}</span>. Sign
            in at icloud.com again and paste a fresh session.
          </DialogDescription>
        </DialogHeader>
        <ICloudSessionInput
          submitLabel="Update session"
          pendingLabel="Updating..."
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  )
}
