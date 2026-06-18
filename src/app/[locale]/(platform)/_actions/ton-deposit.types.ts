import type { RhinoPublicQuote } from '@/lib/rhino/types'

export interface TonDepositQuoteResult {
  error: string | null
  quote: RhinoPublicQuote | null
}

export interface TonDepositPayment {
  /** Commitment id — must be encoded in the TON jetton-transfer forward payload. */
  quoteId: string
  /** USDT amount the user sends on TON. */
  payAmount: string
  /** USDC amount delivered to the deposit wallet on Polygon. */
  receiveAmount: string
  estimatedDurationMs: number | null
  /** rhino's TON bridge contract — destination of the jetton transfer. */
  bridgeContract: string
  /** USDT jetton master on TON — to resolve the sender's jetton wallet. */
  jettonMaster: string
  /** Polygon deposit-wallet address the USDC is delivered to. */
  recipient: string
}

export interface CreateTonDepositResult {
  error: string | null
  payment: TonDepositPayment | null
}
