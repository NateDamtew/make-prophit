import type { CommunityLevel, CommunityStatus } from '@/lib/communities/rules'

/**
 * The trust ladder's arithmetic: a 0–100 score from a community's record,
 * when it moves up a level, and when it goes dormant. Pure; the nightly
 * job feeds it rows and writes the results.
 */

export interface TrustSettings {
  /** Markets resolved on time (no late refund, no overturn) before Level 0 → 1. */
  promoteToLevel1After: number
  /** Resolved on time before Level 1 → 2. */
  promoteToLevel2After: number
  /** Overturned results allowed in the window for a promotion. */
  maxOverturnedForPromotion: number
  /** Minimum average loser rating for a promotion, when ratings exist. */
  minRatingForPromotion: number
  /** Days without a new market before the community is dormant. */
  dormantAfterDays: number
}

const DEFAULT_TRUST_SETTINGS: TrustSettings = {
  promoteToLevel1After: 10,
  promoteToLevel2After: 30,
  maxOverturnedForPromotion: 0,
  minRatingForPromotion: 4,
  dormantAfterDays: 30,
}

export interface TrustRecord {
  /** Markets resolved by the jury (any outcome). */
  resolved: number
  /** Markets refunded because the jury missed its deadline. */
  late: number
  /** Results overturned on appeal. */
  overturned: number
  /** Average loser rating 1–5, null until ratings exist. */
  rating: number | null
  /** When the last market opened. */
  lastMarketAt: Date | null
  now: Date
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/**
 * 0–100. On-time resolution carries most of it, overturned results cost
 * the most, loser ratings and recent activity make up the rest. A brand
 * new community scores 50: nothing proven, nothing broken.
 */
export function computeTrustScore(record: TrustRecord, settings: TrustSettings = DEFAULT_TRUST_SETTINGS): number {
  const decided = record.resolved + record.late
  if (decided === 0 && record.overturned === 0) {
    return 50
  }
  const onTimeRate = decided === 0 ? 1 : record.resolved / decided
  const onTime = 45 * onTimeRate
  const overturnPenalty = record.overturned === 0 ? 30 : Math.max(0, 30 - 15 * record.overturned)
  const ratingPart = record.rating === null ? 10 : 15 * clamp((record.rating - 1) / 4, 0, 1)
  const active = isDormant(record, settings) ? 0 : 10
  return Math.round(clamp(onTime + overturnPenalty + ratingPart + active, 0, 100))
}

/** True once the community has gone `dormantAfterDays` without a new market. */
export function isDormant(
  record: Pick<TrustRecord, 'lastMarketAt' | 'now'>,
  settings: TrustSettings = DEFAULT_TRUST_SETTINGS,
): boolean {
  if (!record.lastMarketAt) {
    return false
  }
  const days = (record.now.getTime() - record.lastMarketAt.getTime()) / (24 * 60 * 60 * 1000)
  return days >= settings.dormantAfterDays
}

/**
 * The level the record earns. Promotions only; demotions are a human's
 * call (an upheld appeal, a freeze) and never happen overnight.
 */
export function decideLevel(
  current: CommunityLevel,
  record: Pick<TrustRecord, 'resolved' | 'overturned' | 'rating'>,
  settings: TrustSettings = DEFAULT_TRUST_SETTINGS,
): CommunityLevel {
  const ratingOk = record.rating === null || record.rating >= settings.minRatingForPromotion
  const overturnOk = record.overturned <= settings.maxOverturnedForPromotion
  if (current === 0 && record.resolved >= settings.promoteToLevel1After && overturnOk && ratingOk) {
    return decideLevel(1, record, settings)
  }
  if (current === 1 && record.resolved >= settings.promoteToLevel2After && overturnOk && ratingOk) {
    return 2
  }
  return current
}

/** What a community still needs for the next level, for the owner's trust card. */
export function nextLevelRequirements(
  current: CommunityLevel,
  record: Pick<TrustRecord, 'resolved' | 'overturned' | 'rating'>,
  settings: TrustSettings = DEFAULT_TRUST_SETTINGS,
): {
  nextLevel: CommunityLevel
  resolvedNeeded: number
  resolvedHave: number
  overturnedOk: boolean
  ratingOk: boolean
} | null {
  if (current === 2) {
    return null
  }
  const target = current === 0 ? settings.promoteToLevel1After : settings.promoteToLevel2After
  return {
    nextLevel: (current + 1) as CommunityLevel,
    resolvedNeeded: target,
    resolvedHave: Math.min(record.resolved, target),
    overturnedOk: record.overturned <= settings.maxOverturnedForPromotion,
    ratingOk: record.rating === null || record.rating >= settings.minRatingForPromotion,
  }
}

/** The status the nightly job writes: active ↔ dormant only; paused and archived are left alone. */
export function decideStatus(
  current: CommunityStatus,
  record: Pick<TrustRecord, 'lastMarketAt' | 'now'>,
  settings: TrustSettings = DEFAULT_TRUST_SETTINGS,
): CommunityStatus {
  if (current === 'paused' || current === 'archived') {
    return current
  }
  return isDormant(record, settings) ? 'dormant' : 'active'
}
