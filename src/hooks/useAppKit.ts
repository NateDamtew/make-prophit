'use client'

import { createContext, use } from 'react'

export interface AppKitValue {
  open: (options?: { view?: string }) => Promise<void>
  close: () => Promise<void>
  isReady: boolean
}

const defaultAppKitValue: AppKitValue = {
  open: async () => {},
  close: async () => {},
  isReady: false,
}

export const AppKitContext = createContext<AppKitValue>(defaultAppKitValue)

export function useAppKit() {
  return use(AppKitContext)
}
