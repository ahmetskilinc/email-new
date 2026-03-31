"use client"

import { atom, useAtom } from "jotai"

type Config = {
  value: string
  highlight: string
  folder: string
  isLoading?: boolean
}

const configAtom = atom<Config>({
  value: "",
  highlight: "",
  folder: "",
  isLoading: false,
})

export function useSearchValue() {
  return useAtom(configAtom)
}
