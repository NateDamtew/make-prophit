'use client'

import { createContext, use } from 'react'

export interface AppKitValue {
  open: (options?: { view?: string }) => Promise<void>
  close: () => Promise<void>
  isReady: boolean
  /** Wallet state, surfaced here so consumers never call Dynamic hooks directly. */
  isEmbedded: boolean
  walletName?: string
  /** Email from the wallet provider (e.g. Google/social login), if any. */
  walletEmail?: string
  logout: () => Promise<void>
}

export const defaultAppKitValue: AppKitValue = {
  open: async () => {},
  close: async () => {},
  isReady: false,
  isEmbedded: false,
  walletName: undefined,
  walletEmail: undefined,
  logout: async () => {},
}

export const AppKitContext = createContext<AppKitValue>(defaultAppKitValue)

export function useAppKit() {
  return use(AppKitContext)
}
