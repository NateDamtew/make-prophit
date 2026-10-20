import { localToUsdCents, usdCentsToLocal } from '@/lib/fx/rules'

/**
 * Pure quote for an order-book stake placed by the house on behalf of a
 * ledger user (design §6.1):
 *   local stake → USD cents (reference rate less margin)
 *   USD cents  → shares at the quoted price (1 share pays $1)
 *   shares     → fixed local payout at the rate used for the stake
 * All floors favour the house.
 */

export const MICRO = 1_000_000n

export interface HouseQuote {
  usdCents: bigint
  usdMicro: bigint
  sharesMicro: bigint
  /** Local minor units the user receives if the outcome wins; fixed at order time. */
  fixedLocalPayout: bigint
  effectivePriceCents: number
}

export function quoteBuy(params: {
  localStake: bigint
  ratePerUsd: number
  marginBps: number
  priceCents: number
}): HouseQuote | null {
  const { localStake, ratePerUsd, marginBps, priceCents } = params
  if (localStake <= 0n || !(ratePerUsd > 0) || !Number.isInteger(priceCents) || priceCents < 1 || priceCents > 99) {
    return null
  }
  const usdCents = localToUsdCents(localStake, ratePerUsd, marginBps)
  if (usdCents <= 0n) {
    return null
  }
  const usdMicro = usdCents * 10_000n
  // shares = usd / price; price in cents → shares_micro = usd_micro * 100 / price_cents
  const sharesMicro = (usdMicro * 100n) / BigInt(priceCents)
  const payoutCents = sharesMicro / 10_000n
  const fixedLocalPayout = usdCentsToLocal(payoutCents, ratePerUsd)
  return { usdCents, usdMicro, sharesMicro, fixedLocalPayout, effectivePriceCents: priceCents }
}

/** Value of selling `sharesMicro` at `priceCents` back into local currency, less margin. */
export function quoteSell(params: {
  sharesMicro: bigint
  ratePerUsd: number
  marginBps: number
  priceCents: number
}): { usdCents: bigint; localProceeds: bigint } | null {
  const { sharesMicro, ratePerUsd, marginBps, priceCents } = params
  if (sharesMicro <= 0n || !(ratePerUsd > 0) || !Number.isInteger(priceCents) || priceCents < 1 || priceCents > 99) {
    return null
  }
  const usdMicro = (sharesMicro * BigInt(priceCents)) / 100n
  const usdCents = usdMicro / 10_000n
  const gross = usdCentsToLocal(usdCents, ratePerUsd)
  const localProceeds = (gross * BigInt(10_000 - Math.max(0, Math.min(marginBps, 10_000)))) / 10_000n
  return { usdCents, localProceeds }
}

/** Payout for a settled position given the outcome's payout fraction (1 = won, 0 = lost, 0.5 = split). */
export function settledPayout(fixedLocalPayout: bigint, payoutFraction: number): bigint {
  if (!(payoutFraction > 0) || fixedLocalPayout <= 0n) {
    return 0n
  }
  const scaled = BigInt(Math.round(Math.min(payoutFraction, 1) * 1_000_000))
  return (fixedLocalPayout * scaled) / 1_000_000n
}
