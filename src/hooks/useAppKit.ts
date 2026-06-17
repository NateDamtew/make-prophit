'use client'

import { createContext, use } from 'react'

export interface AppKitValue {
  open: (options?: { view?: string }) => Promise<void>
  close: () => Promise<void>
  isReady: boolean
  /** Wallet state, surfaced here so consumers never call Dynamic hooks directly. */
  isEmbedded: boolean
  walletName?: string
  logout: () => Promise<void>
}

export const defaultAppKitValue: AppKitValue = {
  open: async () => {},
  close: async () => {},
  isReady: false,
  isEmbedded: false,
  walletName: undefined,
  logout: async () => {},
}

export const AppKitContext = createContext<AppKitValue>(defaultAppKitValue)

export function useAppKit() {
  return use(AppKitContext)
}
