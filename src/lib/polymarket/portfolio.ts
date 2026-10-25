import type { Address } from 'viem'

import { createPublicClient as createPolymarketClient } from '@polymarket/client'
import { createPublicClient, erc20Abi, http } from 'viem'
import { polygon } from 'viem/chains'

/**
 * Read-only view of a Polymarket wallet (no signature needed): positions from
 * Polymarket's Data API and the spendable pUSD balance from the chain.
 */

const PUSD_ADDRESS = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB'

export interface PolymarketPositionView {
  conditionId: string
  title: string
  outcome: string
  slug: string | null
  icon: string | null
  shares: number
  avgPrice: number
  currentPrice: number
  currentValue: number
  pnl: number
  redeemable: boolean
}

function toNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

export async function fetchPolymarketPositions(wallet: Address): Promise<PolymarketPositionView[]> {
  const page = await createPolymarketClient().listPositions({ user: wallet, pageSize: 100 }).firstPage()
  return page.items.map((item: Record<string, any>) => ({
    conditionId: String(item.conditionId ?? ''),
    title: String(item.title ?? ''),
    outcome: String(item.outcome ?? ''),
    slug: typeof item.eventSlug === 'string' ? item.eventSlug : typeof item.slug === 'string' ? item.slug : null,
    icon: typeof item.icon === 'string' ? item.icon : null,
    shares: toNumber(item.size),
    avgPrice: toNumber(item.avgPrice),
    currentPrice: toNumber(item.curPrice),
    currentValue: toNumber(item.currentValue),
    pnl: toNumber(item.cashPnl),
    redeemable: Boolean(item.redeemable),
  }))
}

export async function fetchPolymarketCashBalance(wallet: Address): Promise<number> {
  const client = createPublicClient({ chain: polygon, transport: http() })
  const balance = await client.readContract({
    address: PUSD_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [wallet],
  })
  return Number(balance) / 1e6
}
