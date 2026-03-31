"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { cn } from "@workspace/ui/lib/utils"
import { Label } from "@workspace/ui/components/label"
import { Switch } from "@workspace/ui/components/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Sun01Icon,
  Moon01Icon,
  MonitorStopIcon,
} from "@hugeicons-pro/core-stroke-rounded"
import { useSettings } from "@/hooks/use-settings"
import { saveSettings } from "@/server/actions/settings"
import { toast } from "sonner"
import type { UserSettings } from "@/server/lib/schemas"

const themes = [
  { value: "light", label: "Light", icon: Sun01Icon },
  { value: "dark", label: "Dark", icon: Moon01Icon },
  { value: "system", label: "System", icon: MonitorStopIcon },
] as const

export function GeneralTab() {
  const { theme, setTheme } = useTheme()
  const { data: settingsData } = useSettings()
  const settings = settingsData?.settings

  const updateSetting = async <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    try {
      await saveSettings({ [key]: value })
    } catch {
      toast.error("Failed to save setting")
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection>
        <SettingsRow>
          <SettingsLabel
            title="Theme"
            description="Select a theme to customize the look of the app."
          />
        </SettingsRow>
        <div className="flex gap-3">
          {themes.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                setTheme(t.value)
                updateSetting(
                  "colorTheme",
                  t.value as "light" | "dark" | "system"
                )
              }}
              className={cn(
                "flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 transition-colors",
                theme === t.value
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:border-muted-foreground/30 hover:bg-muted/30"
              )}
            >
              <HugeiconsIcon icon={t.icon} className="size-5" />
              <span className="text-xs font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* <Separator />

      <SettingsSection>
        <SettingsRow>
          <SettingsLabel
            title="Auto-read"
            description="Automatically mark messages as read when you open them."
          />
          <Switch
            size="sm"
            checked={settings?.autoRead ?? true}
            onCheckedChange={(checked) => updateSetting("autoRead", checked)}
          />
        </SettingsRow>

        <SettingsRow>
          <SettingsLabel
            title="External images"
            description="Load images from external sources in emails."
          />
          <Switch
            size="sm"
            checked={settings?.externalImages ?? true}
            onCheckedChange={(checked) =>
              updateSetting("externalImages", checked)
            }
          />
        </SettingsRow>

        <SettingsRow>
          <SettingsLabel
            title="Animations"
            description="Enable UI animations and transitions."
          />
          <Switch
            size="sm"
            checked={settings?.animations ?? false}
            onCheckedChange={(checked) => updateSetting("animations", checked)}
          />
        </SettingsRow>
      </SettingsSection>

      <Separator />

      <SettingsSection>
        <SettingsRow>
          <SettingsLabel
            title="Image compression"
            description="Compression level for image attachments."
          />
          <Select
            value={settings?.imageCompression ?? "medium"}
            onValueChange={(v) =>
              v &&
              updateSetting(
                "imageCompression",
                v as "low" | "medium" | "original"
              )
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="original">Original</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow>
          <SettingsLabel
            title="Undo send"
            description="Briefly delay sending to allow you to undo."
          />
          <Switch
            size="sm"
            checked={settings?.undoSendEnabled ?? false}
            onCheckedChange={(checked) =>
              updateSetting("undoSendEnabled", checked)
            }
          />
        </SettingsRow>
      </SettingsSection> */}
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
