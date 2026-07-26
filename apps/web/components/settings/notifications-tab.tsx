"use client"

import {
  Label,
  Toggle,
  Separator,
  Select,
  SelectButton,
  SelectContent,
  SelectOption,
} from "bruv-ui"
import { useQueryClient } from "@tanstack/react-query"
import { useSettings } from "@/hooks/use-settings"
import { saveSettings } from "@/server/actions/settings"
import { useSession } from "@/lib/auth-client"
import { toast } from "bruv-ui"
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
            items={[
              { value: "none", label: "None" },
              { value: "important", label: "Important only" },
              { value: "all", label: "All messages" },
            ]}
          >
            <SelectButton size="sm" className="w-40" />
            <SelectContent>
              <SelectOption value="none">None</SelectOption>
              <SelectOption value="important">Important only</SelectOption>
              <SelectOption value="all">All messages</SelectOption>
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
          <Toggle
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
          <Toggle
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
          <Toggle
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
          <Toggle
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
      <p className="text-xs text-bruv-tertiary">{description}</p>
    </div>
  )
}
