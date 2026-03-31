"use client"

import { authClient, useSession } from "@/lib/auth-client"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

export function AccountTab() {
  const { data: session, isPending } = useSession()
  const [name, setName] = useState("")
  const nameLoadedRef = useRef(false)
  const [isSavingName, setIsSavingName] = useState(false)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  useEffect(() => {
    if (!nameLoadedRef.current && session?.user?.name) {
      setName(session.user.name)
      nameLoadedRef.current = true
    }
  }, [session?.user?.name])

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error("Name cannot be empty")
      return
    }
    setIsSavingName(true)
    try {
      await authClient.updateUser({ name: name.trim() })
      toast.success("Name updated")
    } catch {
      toast.error("Failed to update name")
    } finally {
      setIsSavingName(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }
    setIsChangingPassword(true)
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      })
      if (result.error) {
        toast.error(result.error.message ?? "Failed to change password")
        return
      }
      toast.success("Password changed")
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch {
      toast.error("Failed to change password")
    } finally {
      setIsChangingPassword(false)
    }
  }

  if (isPending) return null

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div>
          <Label>Email</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            {session?.user?.email}
          </p>
        </div>

        <form onSubmit={handleUpdateName} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-name">Name</Label>
            <Input
              id="settings-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>
          <div>
            <Button type="submit" size="sm" disabled={isSavingName}>
              {isSavingName ? "Saving..." : "Update Name"}
            </Button>
          </div>
        </form>
      </div>

      <Separator />

      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-medium">Change Password</h3>
          <p className="text-sm text-muted-foreground">
            Update the password you use to log in.
          </p>
        </div>

        <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-current-password">Current Password</Label>
            <Input
              id="settings-current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Your current password"
              required
              autoComplete="current-password"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-new-password">New Password</Label>
            <Input
              id="settings-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-confirm-password">Confirm New Password</Label>
            <Input
              id="settings-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div>
            <Button type="submit" size="sm" disabled={isChangingPassword}>
              {isChangingPassword ? "Changing..." : "Change Password"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
