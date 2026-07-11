import type { BlockchainOrder } from '@/types'
import { NextResponse } from 'next/server'

// --- order payload (de)serialization + ERC-7739 envelope -------------------
// Orders are signature_type 3 (DepositWallet): the deposit wallet is
// maker/signer and the user's EOA signs a TypedDataSign envelope wrapping the
// Order struct (see src/lib/orders/signing.ts — this mirrors it server-side so
// the TMA client only raw-signs typed data and never needs viem).

import { EIP712_TYPES } from '@/lib/constants'
import {
  CONDITIONAL_TOKENS_CONTRACT,
  CTF_EXCHANGE_ADDRESS,
  NEG_RISK_CTF_EXCHANGE_ADDRESS,
  UMA_NEG_RISK_ADAPTER_ADDRESS,
  ZERO_BYTES32,
} from '@/lib/contracts'
import { UserRepository } from '@/lib/db/queries/user'
import { DEFAULT_CHAIN_ID } from '@/lib/network'
import {
  buildCollateralApproveCall,
  buildConditionalSetApprovalForAllCall,
} from '@/lib/wallet/transactions'

type TmaUser = NonNullable<Awaited<ReturnType<typeof UserRepository.getCurrentUser>>>

type TmaUserGuard
  = | { user: TmaUser, unauthorized: null }
    | { user: null, unauthorized: NextResponse }

/**
 * Session guard for the TMA bridge routes. The TMA backend calls these with
 * the better-auth session cookie it captured during the headless SIWE
 * handshake — same auth as the web app, no new scheme. Returned as a
 * discriminated union — check `guard.user` WITHOUT destructuring so narrowing
 * proves `unauthorized` is a Response on the null branch (destructuring
 * decorrelates the fields and `next build` rejects the route types).
 */
export async function requireTmaUser(): Promise<TmaUserGuard> {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true })
  if (!user) {
    return {
      user: null,
      unauthorized: NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 }),
    }
  }
  return { user, unauthorized: null }
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * The standard onboarding approval set (see TradingOnboardingProvider's
 *  resolveMissingApprovalCalls — for a fresh wallet everything is missing):
 *  collateral approve for CTF + both exchanges + the UMA neg-risk adapter,
 *  and CTF setApprovalForAll for the exchanges + adapter.
 */
export function buildStandardApprovalCalls() {
  const collateralSpenders = [
    CONDITIONAL_TOKENS_CONTRACT,
    CTF_EXCHANGE_ADDRESS,
    NEG_RISK_CTF_EXCHANGE_ADDRESS,
    UMA_NEG_RISK_ADAPTER_ADDRESS,
  ] as const
  const conditionalOperators = [
    CTF_EXCHANGE_ADDRESS,
    NEG_RISK_CTF_EXCHANGE_ADDRESS,
    UMA_NEG_RISK_ADAPTER_ADDRESS,
  ] as const
  return [
    ...collateralSpenders.map(spender => buildCollateralApproveCall(spender)),
    ...conditionalOperators.map(operator => buildConditionalSetApprovalForAllCall(operator)),
  ]
}

export interface SerializedOrder {
  salt: string
  maker: string
  signer: string
  taker: string
  token_id: string
  maker_amount: string
  taker_amount: string
  expiration: string
  nonce: string
  fee_rate_bps: string
  side: 0 | 1
  signature_type: number
  timestamp: string
  metadata: string
  builder: string
}

export function serializeOrder(order: BlockchainOrder): SerializedOrder {
  return {
    salt: order.salt.toString(),
    maker: order.maker,
    signer: order.signer,
    taker: order.taker,
    token_id: order.token_id.toString(),
    maker_amount: order.maker_amount.toString(),
    taker_amount: order.taker_amount.toString(),
    expiration: order.expiration.toString(),
    nonce: order.nonce.toString(),
    fee_rate_bps: order.fee_rate_bps.toString(),
    side: order.side as 0 | 1,
    signature_type: order.signature_type,
    timestamp: order.timestamp.toString(),
    metadata: order.metadata,
    builder: order.builder,
  }
}

export function deserializeOrder(order: SerializedOrder): BlockchainOrder {
  return {
    salt: BigInt(order.salt),
    maker: order.maker as `0x${string}`,
    signer: order.signer as `0x${string}`,
    taker: order.taker as `0x${string}`,
    token_id: BigInt(order.token_id),
    maker_amount: BigInt(order.maker_amount),
    taker_amount: BigInt(order.taker_amount),
    expiration: BigInt(order.expiration),
    nonce: BigInt(order.nonce),
    fee_rate_bps: BigInt(order.fee_rate_bps),
    side: order.side,
    signature_type: order.signature_type,
    timestamp: BigInt(order.timestamp),
    metadata: order.metadata as `0x${string}`,
    builder: order.builder as `0x${string}`,
  } as BlockchainOrder
}

export function buildOrderMessage(payload: BlockchainOrder) {
  return {
    salt: payload.salt,
    maker: payload.maker,
    signer: payload.signer,
    tokenId: payload.token_id,
    makerAmount: payload.maker_amount,
    takerAmount: payload.taker_amount,
    side: payload.side,
    signatureType: payload.signature_type,
    timestamp: payload.timestamp,
    metadata: payload.metadata,
    builder: payload.builder,
  }
}

const TYPED_DATA_SIGN_TYPES = {
  ...EIP712_TYPES,
  TypedDataSign: [
    { name: 'contents', type: 'Order' },
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
    { name: 'salt', type: 'bytes32' },
  ],
} as const

/** JSON-safe EIP-712 payload for the client to sign (bigints as strings). */
export function buildSignableEnvelope(payload: BlockchainOrder, domain: Record<string, unknown>) {
  const m = buildOrderMessage(payload)
  return {
    domain,
    types: TYPED_DATA_SIGN_TYPES,
    primaryType: 'TypedDataSign' as const,
    message: {
      contents: {
        salt: m.salt.toString(),
        maker: m.maker,
        signer: m.signer,
        tokenId: m.tokenId.toString(),
        makerAmount: m.makerAmount.toString(),
        takerAmount: m.takerAmount.toString(),
        side: m.side,
        signatureType: m.signatureType,
        timestamp: m.timestamp.toString(),
        metadata: m.metadata,
        builder: m.builder,
      },
      name: 'DepositWallet',
      version: '1',
      chainId: DEFAULT_CHAIN_ID.toString(),
      verifyingContract: payload.signer,
      salt: ZERO_BYTES32,
    },
  }
}
