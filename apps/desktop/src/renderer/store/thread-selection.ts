import { atom } from "jotai"

/** Currently selected thread ID — shared across mail list, display, shortcuts, etc. */
export const selectedThreadIdAtom = atom<string | null>(null)

/** Currently selected draft ID — shared across compose dialog and mail display */
export const selectedDraftIdAtom = atom<string | null>(null)
