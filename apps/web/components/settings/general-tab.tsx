"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { cn } from "@workspace/ui/lib/utils"
import {
  Label,
  Toggle,
  Separator,
  Select,
  SelectButton,
  SelectContent,
  SelectOption,
} from "bruv-ui"
import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  ViewColumnsIcon,
} from "@heroicons/react/16/solid"
import { useQueryClient } from "@tanstack/react-query"
import { useSettings } from "@/hooks/use-settings"
import { saveSettings } from "@/server/actions/settings"
import { useSession } from "@/lib/auth-client"
import { toast } from "bruv-ui"
import { setMailLayoutCookie } from "@/hooks/use-mail-layout"
import type { UserSettings } from "@/server/lib/schemas"

const layouts = [
  { value: "split" as const, label: "Split", icon: ViewColumnsIcon },
  { value: "centered" as const, label: "Centered", icon: ViewColumnsIcon },
]

const themes = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: ComputerDesktopIcon },
] as const

export function GeneralTab() {
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const { data: settingsData } = useSettings()
  const settings = settingsData?.settings

  const updateSetting = async <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    try {
      await saveSettings({ [key]: value })
      await queryClient.invalidateQueries({
        queryKey: ["settings", session?.user?.id],
      })
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
          {themes.map((t) => {
            const ThemeIcon = t.icon
            return (
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
                  "flex flex-1 flex-col items-center gap-2 rounded-bruv-lg border p-4 transition-colors",
                  theme === t.value
                    ? "border-bruv-accent bg-bruv-accent/5 text-bruv-primary"
                    : "border-bruv-neutral text-bruv-tertiary hover:border-bruv-neutral-strong hover:bg-bruv-subtle/30"
                )}
              >
                <ThemeIcon className="size-5" />
                <span className="text-xs font-medium">{t.label}</span>
              </button>
            )
          })}
        </div>
      </SettingsSection>

      <Separator />

      <SettingsSection>
        <SettingsRow>
          <SettingsLabel
            title="Mail layout"
            description="Choose how your inbox and emails are displayed."
          />
        </SettingsRow>
        <div className="flex gap-3">
          {layouts.map((l) => {
            const LayoutIcon = l.icon
            return (
              <button
                key={l.value}
                type="button"
                onClick={() => {
                  setMailLayoutCookie(l.value)
                  updateSetting("mailListLayout", l.value)
                }}
                className={cn(
                  "flex flex-1 flex-col items-center gap-2 rounded-bruv-lg border p-4 transition-colors",
                  (settings?.mailListLayout ?? "split") === l.value
                    ? "border-bruv-accent bg-bruv-accent/5 text-bruv-primary"
                    : "border-bruv-neutral text-bruv-tertiary hover:border-bruv-neutral-strong hover:bg-bruv-subtle/30"
                )}
              >
                <LayoutIcon className="size-5" />
                <span className="text-xs font-medium">{l.label}</span>
              </button>
            )
          })}
        </div>
      </SettingsSection>

      <Separator />

      <SettingsSection>
        <SettingsRow>
          <SettingsLabel
            title="Auto-read"
            description="Automatically mark messages as read when you open them."
          />
          <Toggle
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
          <Toggle
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
          <Toggle
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
            items={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "original", label: "Original" },
            ]}
          >
            <SelectButton size="sm" className="w-40" />
            <SelectContent>
              <SelectOption value="low">Low</SelectOption>
              <SelectOption value="medium">Medium</SelectOption>
              <SelectOption value="original">Original</SelectOption>
            </SelectContent>
          </Select>
        </SettingsRow>

        <SettingsRow>
          <SettingsLabel
            title="Undo send"
            description="Briefly delay sending to allow you to undo."
          />
          <Toggle
            size="sm"
            checked={settings?.undoSendEnabled ?? false}
            onCheckedChange={(checked) =>
              updateSetting("undoSendEnabled", checked)
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
