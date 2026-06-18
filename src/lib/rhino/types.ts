/**
 * Types for the rhino.fi bridge REST API.
 *
 * The config + public-quote shapes are modelled directly from live responses.
 * The authenticated shapes (user quote / commit / status) are intentionally
 * conservative until we exercise them with a real API key — see client.ts.
 */

export interface RhinoTokenConfig {
  token: string
  address: string
  decimals: number
  maxDepositLimit?: number
  maxWithdrawLimit?: number
}

export interface RhinoChainConfig {
  name: string
  type: string // 'EVM' | 'TON' | 'SOL' | 'STK' | 'TRON' | ...
  networkId: string
  contractAddress: string
  status: 'enabled' | 'disabled'
  nativeTokenName: string
  nativeTokenDecimals: number
  blockExplorer: string
  enabledDepositAddress: boolean
  tokens: Record<string, RhinoTokenConfig>
}

export type RhinoConfig = Record<string, RhinoChainConfig>

export interface RhinoQuoteFees {
  fee: string
  feeUsd: number
  gasFee: string
  gasFeeUsd: number
  percentageFee: string
  percentageFeeUsd: number
  percentageFeeAmount: number
  platformFee: string
  platformFeeUsd: number
}

export interface RhinoPublicQuote {
  chainIn: string
  chainOut: string
  tokenIn: string
  tokenOut: string
  payAmount: string
  payAmountUsd: number
  receiveAmount: string
  receiveAmountUsd: number
  minReceiveAmount: string
  minReceiveAmountUsd: number
  fees: RhinoQuoteFees
  speed: string
  bridgeToken: string
  _tag: string
}

export interface PublicQuoteParams {
  tokenIn: string
  tokenOut: string
  chainIn: string
  chainOut: string
  /** Human-readable amount of the source token (e.g. "10" = 10 USDT). */
  amount: string
  /** "pay" = amount is what you send; "receive" = amount is what you want out. */
  mode: 'pay' | 'receive'
}

export interface UserQuoteParams extends PublicQuoteParams {
  /** Source-chain address paying in (the connected TON wallet). */
  depositor: string
  /** Destination address receiving the output (the Polygon deposit wallet). */
  recipient: string
}

/**
 * A committed user quote. `quoteId` is the commitment id that must be encoded
 * into the TON jetton-transfer forward payload. The remaining payment fields
 * are returned by rhino and modelled loosely until validated with an API key.
 */
export interface RhinoUserQuote extends RhinoPublicQuote {
  quoteId: string
  expiresAt?: string
  depositor: string
  recipient: string
}

export type RhinoBridgeState
  = | 'PENDING'
    | 'PROCESSING'
    | 'EXECUTED'
    | 'COMPLETED'
    | 'FAILED'
    | (string & {})

export interface RhinoBridgeStatus {
  bridgeId?: string
  state: RhinoBridgeState
  chainIn?: string
  chainOut?: string
  amountIn?: string
  amountOut?: string
  withdrawTxHash?: string
}
