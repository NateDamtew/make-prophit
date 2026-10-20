'use server'

import type { PoolSummary } from '@/lib/pools/service'

import { UserRepository } from '@/lib/db/queries/user'
import { parseAmountToMinorUnits } from '@/lib/pawapay/amounts'
import {
  estimateStakePayout,
  getPoolByMarket,
  getPoolSummary,
  POOL_ERROR_MESSAGES,
  PoolError,
  stakeInPool,
} from '@/lib/pools/service'

export async function getPoolSummaryAction(
  communityMarketId: string,
): Promise<{ data: PoolSummary | null; error: string | null }> {
  try {
    const user = await UserRepository.getCurrentUser({ minimal: true })
    const data = await getPoolSummary(communityMarketId, user?.id ?? null)
    return { data, error: null }
  } catch (error) {
    console.error('[pool] summary failed', error)
    return { data: null, error: 'Could not load this market’s pool right now.' }
  }
}

export async function estimatePoolPayoutAction(communityMarketId: string, outcome: 'yes' | 'no', amountInput: string) {
  try {
    const pool = await getPoolByMarket(communityMarketId)
    if (!pool) {
      return { data: null, error: POOL_ERROR_MESSAGES.pool_not_found }
    }
    const amount = parseAmountToMinorUnits(amountInput)
    return { data: { payoutMinor: estimateStakePayout(pool, outcome, amount).toString() }, error: null }
  } catch {
    return { data: null, error: 'Please enter a valid amount.' }
  }
}

export async function stakeInPoolAction(input: {
  communityMarketId: string
  outcome: 'yes' | 'no'
  amountInput: string
}) {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user) {
    return { data: null, error: 'You must be signed in.' }
  }
  if (input.outcome !== 'yes' && input.outcome !== 'no') {
    return { data: null, error: 'Pick Yes or No.' }
  }
  let amountMinor: bigint
  try {
    amountMinor = parseAmountToMinorUnits(input.amountInput)
  } catch {
    return { data: null, error: 'Please enter a valid amount.' }
  }
  try {
    const result = await stakeInPool({
      communityMarketId: input.communityMarketId,
      userId: user.id,
      outcome: input.outcome,
      amountMinor,
    })
    return {
      data: {
        stakeId: result.stake.id,
        totalYes: result.pool.total_yes.toString(),
        totalNo: result.pool.total_no.toString(),
      },
      error: null,
    }
  } catch (error) {
    if (error instanceof PoolError) {
      return { data: null, error: error.message }
    }
    console.error('[pool] stake failed', error)
    return { data: null, error: 'Could not place that stake right now. Please try again.' }
  }
}
