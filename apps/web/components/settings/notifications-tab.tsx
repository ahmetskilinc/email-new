"use client"

import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import { useState } from "react"
import { toast } from "sonner"

export function NotificationsTab() {
  const [notificationLevel, setNotificationLevel] = useState("all")
  const [marketingEmails, setMarketingEmails] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = () => {
    setIsSaving(true)
    setTimeout(() => {
      setIsSaving(false)
      toast.success("Settings saved")
    }, 500)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label>New Mail Notifications</Label>
          <Select
            value={notificationLevel}
            onValueChange={(v) => v && setNotificationLevel(v)}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Select level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="important">Important Only</SelectItem>
              <SelectItem value="all">All Messages</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Choose which messages trigger notifications.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex flex-col gap-0.5">
            <Label>Marketing Communications</Label>
            <p className="text-xs text-muted-foreground">
              Receive updates about new features
            </p>
          </div>
          <Switch
            checked={marketingEmails}
            onCheckedChange={setMarketingEmails}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          variant="secondary"
          onClick={() => {
            setNotificationLevel("all")
            setMarketingEmails(false)
          }}
        >
          Reset
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
