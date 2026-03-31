"use client"

import { atom, useAtom } from "jotai"

type DoState = {
  isSyncing: boolean
  syncingFolders: string[]
  storageSize: number
  counts: { label: string; count: number }[]
  shards: number
}

const stateAtom = atom<DoState>({
  isSyncing: false,
  syncingFolders: [],
  storageSize: 0,
  counts: [],
  shards: 0,
})

export function useDoState() {
  return useAtom(stateAtom)
}

export const useStats = () => {
  const [doState] = useDoState()
  return { data: doState.counts }
}
