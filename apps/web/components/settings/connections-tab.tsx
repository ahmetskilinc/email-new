"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@workspace/ui/components/dialog"
import { useSession, authClient } from "@/lib/auth-client"
import { useConnections } from "@/hooks/use-connections"
import { deleteConnection } from "@/server/actions/connections"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { emailProviders } from "@/lib/constants"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon } from "@hugeicons-pro/core-stroke-rounded"
import { toast } from "sonner"
import { AddConnectionDialog } from "./add-connection-dialog"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

function ConnectionSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-lg border p-4">
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-44" />
      </div>
    </div>
  )
}

export function ConnectionsTab() {
  const [addOpen, setAddOpen] = useState(false)
  const { data, isPending, refetch: refetchConnections } = useConnections()
  const { refetch } = useSession()

  const disconnectAccount = async (connectionId: string) => {
    try {
      await deleteConnection(connectionId)
      toast.success("Account disconnected successfully")
      void refetchConnections()
      refetch()
    } catch {
      toast.error("Failed to disconnect account")
    }
  }

  const connections = data?.connections ?? []
  const disconnectedIds = data?.disconnectedIds ?? []

  return (
    <div className="flex flex-col gap-6">
      {isPending ? (
        <div className="flex flex-col gap-3">
          <ConnectionSkeleton />
          <ConnectionSkeleton />
        </div>
      ) : connections.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12">
          <p className="text-sm font-medium">No accounts connected</p>
          <p className="text-sm text-muted-foreground">
            Connect an email account to get started.
          </p>
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
            Add Account
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddOpen(true)}
            >
              <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
              Add Account
            </Button>
          </div>
          {connections.map((connection) => {
            const provider = emailProviders.find(
              (p) => p.providerId === connection.providerId
            )
            const ActiveConnectionIcon = emailProviders.find(
              (p) => p.providerId === connection.providerId
            )?.icon
            const isDisconnected = disconnectedIds.includes(connection.id)
            const isOnly = connections.length === 1

            return (
              <div
                key={connection.id}
                className="flex items-center gap-4 rounded-lg border p-4"
              >
                {connection?.picture ? (
                  <Avatar className="size-10">
                    <AvatarImage
                      src={connection.picture}
                      alt={connection.name || connection.email}
                    />
                    <AvatarFallback className="text-lg">
                      {(connection.name || connection.email)
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-full border bg-sidebar-accent">
                    {ActiveConnectionIcon && (
                      <ActiveConnectionIcon className="size-4" />
                    )}
                  </div>
                )}

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {connection.name}
                    </span>
                    {provider && (
                      <span className="text-xs text-muted-foreground">
                        {provider.name}
                      </span>
                    )}
                    {isDisconnected && (
                      <Badge variant="destructive">Disconnected</Badge>
                    )}
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {connection.email}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {isDisconnected && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        await authClient.linkSocial({
                          provider: connection.providerId,
                          callbackURL: window.location.href,
                        })
                      }}
                    >
                      Reconnect
                    </Button>
                  )}
                  <Dialog>
                    <DialogTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          disabled={isOnly}
                        >
                          Remove
                        </Button>
                      }
                    />
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Disconnect Email Account</DialogTitle>
                        <DialogDescription>
                          Are you sure you want to disconnect{" "}
                          <span className="font-medium text-foreground">
                            {connection.email}
                          </span>
                          ?
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex justify-end gap-3">
                        <DialogClose
                          render={<Button variant="secondary">Cancel</Button>}
                        />
                        <DialogClose
                          render={
                            <Button
                              variant="destructive"
                              onClick={() => disconnectAccount(connection.id)}
                            >
                              Disconnect
                            </Button>
                          }
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AddConnectionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          void refetchConnections()
          refetch()
        }}
      />
    </div>
  )
}
