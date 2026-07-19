'use client'

import { createContext, use } from 'react'

/** A single TON Connect transaction message (web-safe; no `@dynamic-labs/ton` import). */
export interface TonTxMessage {
  /** Receiver's address. */
  address: string
  /** Amount to send in nanoton (decimal string). */
  amount: string
  /** Contract-specific data as a base64 BOC. */
  payload?: string
  /** State init as a base64 BOC, if deploying. */
  stateInit?: string
}

export interface AppKitValue {
  open: (options?: { view?: string, namespace?: string }) => Promise<void>
  close: () => Promise<void>
  isReady: boolean
  /** Wallet state, surfaced here so consumers never call Dynamic hooks directly. */
  isEmbedded: boolean
  walletName?: string
  /** Email from the wallet provider (e.g. Google/social login), if any. */
  walletEmail?: string
  logout: () => Promise<void>
  /** Connected TON wallet address (TMA only), if any. */
  tonWalletAddress?: string
  /** Opens the Dynamic link-new-wallet modal so the user can connect a TON wallet. */
  connectTonWallet: () => void
  /** Sends a TON Connect transaction via the connected TON wallet; returns the BOC. */
  sendTonTransaction: (messages: TonTxMessage[], validUntilSeconds?: number) => Promise<string>
  /** Sends a Dynamic email OTP — verifying it creates an embedded EVM wallet. */
  sendEmailOtp: (email: string) => Promise<void>
  /** Verifies the email OTP code; on success Dynamic creates the embedded wallet + SIWE. */
  verifyEmailOtp: (code: string) => Promise<void>
}

export const defaultAppKitValue: AppKitValue = {
  open: async () => {},
  close: async () => {},
  isReady: false,
  isEmbedded: false,
  walletName: undefined,
  walletEmail: undefined,
  logout: async () => {},
  tonWalletAddress: undefined,
  connectTonWallet: () => {},
  sendTonTransaction: async () => {
    throw new Error('TON wallet is not available')
  },
  sendEmailOtp: async () => {},
  verifyEmailOtp: async () => {},
}

export const AppKitContext = createContext<AppKitValue>(defaultAppKitValue)

export function useAppKit() {
  return use(AppKitContext)
}
