import type { RhinoPublicQuote } from '@/lib/rhino/types'

export interface TonWithdrawalQuoteResult {
  error: string | null
  quote: RhinoPublicQuote | null
}

export interface TonWithdrawalOrder {
  /** Commitment id — passed to the EVM `depositWithId` call. */
  quoteId: string
  /** USDC amount the deposit wallet pays on Polygon (human-readable). */
  payAmount: string
  /** USDT amount delivered to the TON wallet. */
  receiveAmount: string
  estimatedDurationMs: number | null
  /** rhino's Polygon bridge contract — target of `depositWithId`. */
  bridgeContract: string
  /** Polygon USDC token address (matches our trading collateral). */
  token: string
  /** USDC amount in base units (6 dp) to approve + deposit. */
  amountBaseUnits: string
}

export interface CreateTonWithdrawalResult {
  error: string | null
  order: TonWithdrawalOrder | null
}
