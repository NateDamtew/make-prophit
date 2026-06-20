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
  open: (options?: { view?: string }) => Promise<void>
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
  /** Whether Dynamic's SDK has finished loading — gate Telegram sign-in on this. */
  sdkHasLoaded: boolean
  /**
   * Authenticates a TMA user with Dynamic via a minted telegramAuthToken,
   * auto-creating an embedded EVM wallet. Best-effort: callers must verify a
   * wallet address actually appeared rather than assuming success.
   */
  signInWithTelegram: (telegramAuthToken: string) => Promise<void>
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
  sdkHasLoaded: false,
  signInWithTelegram: async () => {},
}

export const AppKitContext = createContext<AppKitValue>(defaultAppKitValue)

export function useAppKit() {
  return use(AppKitContext)
}
