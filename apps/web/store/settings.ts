import { atom, useAtom, useSetAtom } from "jotai"
import { useCallback } from "react"

export type SettingsTab =
  | "general"
  | "account"
  | "connections"
  | "signatures"
  | "notifications"

interface SettingsState {
  open: boolean
  tab: SettingsTab
}

const settingsAtom = atom<SettingsState>({ open: false, tab: "general" })

export function useSettingsDialog() {
  const [state, setState] = useAtom(settingsAtom)

  const setOpen = useCallback(
    (open: boolean) => {
      setState((prev) => (open ? prev : { ...prev, open: false }))
    },
    [setState]
  )

  return [state, setOpen] as const
}

export function useOpenSettings() {
  const setState = useSetAtom(settingsAtom)

  return useCallback(
    (tab: SettingsTab = "general") => {
      setState({ open: true, tab })
    },
    [setState]
  )
}
