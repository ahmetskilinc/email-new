import { atom, useAtom, useAtomValue, useSetAtom } from "jotai"
import { useCallback } from "react"

const selectedThreadIdsAtom = atom<Set<string>>(new Set<string>())

const selectedCountAtom = atom((get) => get(selectedThreadIdsAtom).size)

export function useSelectedThreadIds() {
  return useAtomValue(selectedThreadIdsAtom)
}

export function useSelectedCount() {
  return useAtomValue(selectedCountAtom)
}

export function useIsThreadSelected(id: string) {
  const selected = useAtomValue(selectedThreadIdsAtom)
  return selected.has(id)
}

export function useSelectionActions() {
  const setSelected = useSetAtom(selectedThreadIdsAtom)

  const toggle = useCallback(
    (id: string) => {
      setSelected((prev: Set<string>) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [setSelected],
  )

  const selectAll = useCallback(
    (ids: string[]) => {
      setSelected(new Set(ids))
    },
    [setSelected],
  )

  const clearAll = useCallback(() => {
    setSelected(new Set())
  }, [setSelected])

  return { toggle, selectAll, clearAll }
}
