"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useConnections } from "@/hooks/use-connections"
import { useSignatures } from "@/hooks/use-signatures"
import {
  createSignature,
  updateSignature,
  deleteSignature,
} from "@/server/actions/signatures"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { SignatureEditor } from "./signature-editor"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import { Separator } from "@workspace/ui/components/separator"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "sonner"

type EditingSignature = {
  id?: string
  name: string
  body: string
  isDefault: boolean
}

export function SignaturesTab() {
  const { data: connectionsData, isPending: connectionsLoading } =
    useConnections()
  const connections = connectionsData?.connections ?? []
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null)

  const activeConnectionId = selectedConnectionId ?? connections[0]?.id ?? null

  const { data: signatures, isPending: signaturesLoading } =
    useSignatures(activeConnectionId)
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState<EditingSignature | null>(null)
  const [saving, setSaving] = useState(false)

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["signatures", activeConnectionId ?? "all"],
    })

  const handleSave = async () => {
    if (!editing || !activeConnectionId) return
    setSaving(true)
    try {
      if (editing.id) {
        await updateSignature(editing.id, {
          name: editing.name,
          body: editing.body,
          isDefault: editing.isDefault,
        })
        toast.success("Signature updated")
      } else {
        await createSignature({
          connectionId: activeConnectionId,
          name: editing.name,
          body: editing.body,
          isDefault: editing.isDefault,
        })
        toast.success("Signature created")
      }
      setEditing(null)
      await invalidate()
    } catch {
      toast.error("Failed to save signature")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteSignature(id)
      toast.success("Signature deleted")
      await invalidate()
    } catch {
      toast.error("Failed to delete signature")
    }
  }

  if (connectionsLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-60" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  if (connections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect an email account first to manage signatures.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Connection</Label>
        <Select
          value={activeConnectionId ?? ""}
          onValueChange={(v) => {
            setSelectedConnectionId(v)
            setEditing(null)
          }}
        >
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue>
              {connections.find((c) => c.id === activeConnectionId)?.email ??
                "Select connection"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {connections.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Separator />

      {editing ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-medium">
            {editing.id ? "Edit Signature" : "New Signature"}
          </h3>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sig-name">Name</Label>
            <Input
              id="sig-name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="e.g. Work, Personal, Casual"
              className="max-w-xs"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Signature</Label>
            <SignatureEditor
              value={editing.body}
              onChange={(html) => setEditing({ ...editing, body: html })}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="sig-default"
              size="sm"
              checked={editing.isDefault}
              onCheckedChange={(checked) =>
                setEditing({ ...editing, isDefault: checked })
              }
            />
            <Label htmlFor="sig-default" className="text-sm">
              Set as default for this account
            </Label>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving || !editing.name.trim()}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Signatures</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setEditing({ name: "", body: "", isDefault: false })
              }
            >
              Add Signature
            </Button>
          </div>

          {signaturesLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !signatures?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No signatures yet for this account.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {signatures.map((sig) => (
                <div
                  key={sig.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{sig.name}</span>
                      {sig.isDefault && (
                        <Badge variant="secondary" className="text-[10px]">
                          Default
                        </Badge>
                      )}
                    </div>
                    {sig.body ? (
                      <div
                        className="prose-xs line-clamp-2 text-xs text-muted-foreground"
                        dangerouslySetInnerHTML={{ __html: sig.body }}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">(empty)</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEditing({
                          id: sig.id,
                          name: sig.name,
                          body: sig.body,
                          isDefault: sig.isDefault,
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(sig.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
