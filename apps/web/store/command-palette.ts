import { atom, useAtom } from "jotai"

const commandPaletteAtom = atom(false)

export function useCommandPalette() {
  return useAtom(commandPaletteAtom)
}
