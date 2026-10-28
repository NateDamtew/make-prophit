import { create } from 'zustand'

/**
 * How many community sheets are open. The mobile bottom nav hides while any
 * sheet is up so the sheet's own button is the one thing on screen.
 */
interface SheetState {
  openCount: number
  opened: () => void
  closed: () => void
}

export const useSheetState = create<SheetState>((set) => ({
  openCount: 0,
  opened: () => set((state) => ({ openCount: state.openCount + 1 })),
  closed: () => set((state) => ({ openCount: Math.max(0, state.openCount - 1) })),
}))
