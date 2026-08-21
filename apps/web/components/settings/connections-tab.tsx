"use client"

import { useState } from "react"
import { useSession, authClient } from "@/lib/auth-client"
import { useConnections } from "@/hooks/use-connections"
import { deleteConnection } from "@/server/actions/connections"
import { emailProviders } from "@/lib/constants"
import { Dialog, Button, Badge, Skeleton, Avatar } from "bruv-ui"
import { PlusIcon } from "@heroicons/react/16/solid"
import { toast } from "bruv-ui"
import { AddConnectionDialog } from "./add-connection-dialog"
import { ICloudReconnectDialog } from "@/components/connection/icloud-reconnect-dialog"

function ConnectionSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-bruv-lg border p-4">
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
  const [reconnecting, setReconnecting] = useState<{
    id: string
    email: string
  } | null>(null)
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
        <div className="flex flex-col items-center justify-center gap-3 rounded-bruv-lg border border-dashed py-12">
          <p className="text-sm font-medium">No accounts connected</p>
          <p className="text-sm text-bruv-tertiary">
            Connect an email account to get started.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddOpen(true)}
            iconLeft={<PlusIcon />}
          >
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
              iconLeft={<PlusIcon />}
            >
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
            // An expired iCloud web session is re-imported, not re-granted:
            // there is no OAuth flow behind it to send the user through.
            const needsSessionReimport =
              connection.providerId === "icloud" && connection.usesWebService
            // A connection that still has an app-specific password keeps
            // working over IMAP after Apple drops the session, so it is not
            // "Disconnected" — but the user should still be told, or the
            // account quietly stays on the slower path forever.
            const sessionExpired =
              needsSessionReimport &&
              connection.connectionState !== "connected" &&
              !isDisconnected

            return (
              <div
                key={connection.id}
                className="flex items-center gap-4 rounded-bruv-lg border p-4"
              >
                {connection?.picture ? (
                  <Avatar
                    size="lg"
                    src={connection.picture}
                    alt={connection.name || connection.email}
                    initials={(connection.name || connection.email)
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  />
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-full border bg-bruv-subtle">
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
                      <span className="text-xs text-bruv-tertiary">
                        {provider.name}
                      </span>
                    )}
                    {isDisconnected && (
                      <Badge variant="danger">Disconnected</Badge>
                    )}
                    {sessionExpired && (
                      <Badge variant="warn">iCloud session expired</Badge>
                    )}
                  </div>
                  <span className="truncate text-xs text-bruv-tertiary">
                    {connection.email}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {(isDisconnected || sessionExpired) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        if (needsSessionReimport) {
                          setReconnecting({
                            id: connection.id,
                            email: connection.email,
                          })
                          return
                        }
                        await authClient.linkSocial({
                          provider: connection.providerId,
                          callbackURL: window.location.href,
                        })
                      }}
                    >
                      Reconnect
                    </Button>
                  )}
                  <Dialog.Root>
                    <Dialog.Trigger
                      render={
                        <Button
                          variant="transparent"
                          size="sm"
                          className="text-bruv-tertiary hover:text-bruv-danger"
                          disabled={isOnly}
                        >
                          Remove
                        </Button>
                      }
                    />
                    <Dialog.Content className="flex w-[90vw] max-w-md flex-col gap-4 p-4">
                      <div className="flex flex-col gap-2">
                        <Dialog.Title className="border-none p-0 text-base font-medium leading-none">
                          Disconnect Email Account
                        </Dialog.Title>
                        <p className="text-sm text-bruv-tertiary">
                          Are you sure you want to disconnect{" "}
                          <span className="font-medium text-bruv-primary">
                            {connection.email}
                          </span>
                          ?
                        </p>
                      </div>
                      <div className="flex justify-end gap-3">
                        <Dialog.Close
                          render={<Button variant="secondary">Cancel</Button>}
                        />
                        <Dialog.Close
                          render={
                            <Button
                              variant="danger-light"
                              onClick={() => disconnectAccount(connection.id)}
                            >
                              Disconnect
                            </Button>
                          }
                        />
                      </div>
                    </Dialog.Content>
                  </Dialog.Root>
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

      {reconnecting && (
        <ICloudReconnectDialog
          open
          onOpenChange={(open) => {
            if (!open) setReconnecting(null)
          }}
          connectionId={reconnecting.id}
          email={reconnecting.email}
          onSuccess={() => {
            void refetchConnections()
            refetch()
          }}
        />
      )}
    </div>
  )
}
