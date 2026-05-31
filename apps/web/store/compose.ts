import { atom, useAtom, useSetAtom } from "jotai"
import { useCallback } from "react"

export interface ComposeInitialData {
  to?: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  message?: string
  threadId?: string
  headers?: Record<string, string>
}

interface ComposeState {
  open: boolean
  initialData?: ComposeInitialData
}

const composeAtom = atom<ComposeState>({ open: false })

export function useComposeDialog() {
  const [state, setState] = useAtom(composeAtom)

  const setOpen = useCallback(
    (open: boolean) => {
      setState(open ? { open: true } : { open: false })
    },
    [setState]
  )

  return [state, setOpen] as const
}

export function useOpenCompose() {
  const setState = useSetAtom(composeAtom)

  return useCallback(
    (data?: ComposeInitialData) => {
      setState({ open: true, initialData: data })
    },
    [setState]
  )
}
