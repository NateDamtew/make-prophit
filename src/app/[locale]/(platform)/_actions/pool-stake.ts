'use server'

import type { PoolOutcome } from '@/lib/db/schema/pools/tables'
import type { PoolActivityItem, PoolHolder, PoolOddsPoint } from '@/lib/pools/activity'
import type { PoolSummary } from '@/lib/pools/service'

import { UserRepository } from '@/lib/db/queries/user'
import { parseAmountToMinorUnits } from '@/lib/pawapay/amounts'
import { getPoolActivity, getPoolOddsHistory, getPoolTopHolders } from '@/lib/pools/activity'
import { getPoolByMarket, getPoolSummary, PoolError, stakeInPool } from '@/lib/pools/service'

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

export async function stakeInPoolAction(input: {
  communityMarketId: string
  outcome: 'yes' | 'no'
  amountInput: string
  acceptTerms?: boolean
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
      acceptTerms: input.acceptTerms === true,
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

export async function getPoolHistoryAction(communityMarketId: string): Promise<{ data: PoolOddsPoint[] }> {
  try {
    const pool = await getPoolByMarket(communityMarketId)
    if (!pool) {
      return { data: [] }
    }
    return { data: await getPoolOddsHistory(pool.id) }
  } catch (error) {
    console.error('[pool] history failed', error)
    return { data: [] }
  }
}

export async function getPoolTopHoldersAction(
  communityMarketId: string,
): Promise<{ data: { yes: PoolHolder[]; no: PoolHolder[] } }> {
  try {
    const pool = await getPoolByMarket(communityMarketId)
    if (!pool) {
      return { data: { yes: [], no: [] } }
    }
    return { data: await getPoolTopHolders(pool.id) }
  } catch (error) {
    console.error('[pool] holders failed', error)
    return { data: { yes: [], no: [] } }
  }
}

export async function getPoolActivityAction(
  communityMarketId: string,
  outcome: PoolOutcome | null = null,
): Promise<{ data: PoolActivityItem[] }> {
  try {
    const pool = await getPoolByMarket(communityMarketId)
    if (!pool) {
      return { data: [] }
    }
    return { data: await getPoolActivity(pool.id, { outcome, limit: 100 }) }
  } catch (error) {
    console.error('[pool] activity failed', error)
    return { data: [] }
  }
}
