import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import { Separator } from "@workspace/ui/components/separator"
import { useQueryClient } from "@tanstack/react-query"
import { useSettings } from "@/hooks/use-settings"
import { saveSettings } from "@/lib/api"
import { useSession } from "@/lib/auth-client"
import { toast } from "sonner"
import {
  defaultNotificationSettings,
  type NotificationSettings,
} from "@/server/lib/schemas"

export function NotificationsTab() {
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const { data: settingsData } = useSettings()
  const notifications =
    settingsData?.settings.notifications ?? defaultNotificationSettings

  const updateNotifications = async (patch: Partial<NotificationSettings>) => {
    try {
      await saveSettings({ notifications: { ...notifications, ...patch } })
      await queryClient.invalidateQueries({
        queryKey: ["settings", session?.user?.id],
      })
    } catch {
      toast.error("Failed to save setting")
    }
  }

  const handleDesktopToggle = async (checked: boolean) => {
    if (!checked) {
      await updateNotifications({ desktop: false })
      return
    }
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Desktop notifications are not supported in this browser")
      return
    }
    let permission = Notification.permission
    if (permission === "default") {
      permission = await Notification.requestPermission()
    }
    if (permission !== "granted") {
      toast.error("Desktop notifications permission denied")
      return
    }
    await updateNotifications({ desktop: true })
  }

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection>
        <SettingsRow>
          <SettingsLabel
            title="New mail notifications"
            description="Choose which messages trigger notifications."
          />
          <Select
            value={notifications.level}
            onValueChange={(v) =>
              v &&
              updateNotifications({
                level: v as NotificationSettings["level"],
              })
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="important">Important only</SelectItem>
              <SelectItem value="all">All messages</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsSection>

      <Separator />

      <SettingsSection>
        <SettingsRow>
          <SettingsLabel
            title="In-app notifications"
            description="Show a toast inside the app when new mail arrives."
          />
          <Switch
            size="sm"
            checked={notifications.inApp}
            onCheckedChange={(checked) =>
              updateNotifications({ inApp: checked })
            }
          />
        </SettingsRow>

        <SettingsRow>
          <SettingsLabel
            title="Desktop notifications"
            description="Show an OS-level notification while the app is open."
          />
          <Switch
            size="sm"
            checked={notifications.desktop}
            onCheckedChange={handleDesktopToggle}
          />
        </SettingsRow>

        <SettingsRow>
          <SettingsLabel
            title="Sound"
            description="Play a sound when a notification appears."
          />
          <Switch
            size="sm"
            checked={notifications.sound}
            onCheckedChange={(checked) =>
              updateNotifications({ sound: checked })
            }
          />
        </SettingsRow>
      </SettingsSection>

      <Separator />

      <SettingsSection>
        <SettingsRow>
          <SettingsLabel
            title="Marketing communications"
            description="Receive updates about new features."
          />
          <Switch
            size="sm"
            checked={notifications.marketing}
            onCheckedChange={(checked) =>
              updateNotifications({ marketing: checked })
            }
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  )
}

function SettingsSection({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-5">{children}</div>
}

function SettingsRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">{children}</div>
  )
}

function SettingsLabel({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label className="text-sm font-medium">{title}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
