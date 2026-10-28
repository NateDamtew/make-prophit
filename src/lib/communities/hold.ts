/**
 * The payout hold: after a jury result, payouts are computed at once but
 * released only after a wait, so any staker can read the verdicts and appeal.
 * An open appeal stretches the wait to a hard maximum. Pure, unit-tested.
 *
 * See notes/COMMUNITIES-CONCEPT.md §6.
 */

const HOUR_MS = 60 * 60 * 1000

export interface HoldSettings {
  /** Hours payouts wait after the result is announced. */
  holdHours: number
  /** Longest a hold may run when an appeal is open, from the announcement. */
  appealMaxHours: number
}

export const DEFAULT_HOLD_SETTINGS: HoldSettings = { holdHours: 24, appealMaxHours: 48 }

/** When payouts land if nobody appeals. */
export function computeHoldUntil(announcedAt: Date, settings: HoldSettings = DEFAULT_HOLD_SETTINGS): Date {
  return new Date(announcedAt.getTime() + Math.max(0, settings.holdHours) * HOUR_MS)
}

/** The extended deadline once an appeal is open. */
export function computeAppealHoldUntil(announcedAt: Date, settings: HoldSettings = DEFAULT_HOLD_SETTINGS): Date {
  const max = Math.max(settings.holdHours, settings.appealMaxHours)
  return new Date(announcedAt.getTime() + max * HOUR_MS)
}

export type ReleaseDecision = 'release' | 'wait' | 'frozen' | 'not_held'

export interface ReleaseInput {
  state: string
  holdUntil: Date | null
  holdExtendedUntil: Date | null
  payoutsFrozen: boolean
  /** True while an appeal is open, has met its threshold or is under review. */
  appealActive: boolean
  isImported: boolean
  now: Date
}

/**
 * Whether a held pool may pay out now.
 * - frozen: an appeal reached its threshold; only an admin ruling releases it.
 * - imported markets settle from their source: no hold.
 * - an open appeal that has not met its threshold waits until the extended
 *   deadline, then the result stands and payouts go out.
 */
export function decideRelease(input: ReleaseInput): ReleaseDecision {
  if (input.state !== 'held') {
    return 'not_held'
  }
  if (input.payoutsFrozen) {
    return 'frozen'
  }
  if (input.isImported) {
    return 'release'
  }
  const deadline = input.appealActive ? (input.holdExtendedUntil ?? input.holdUntil) : input.holdUntil
  if (!deadline) {
    return 'release'
  }
  return input.now.getTime() >= deadline.getTime() ? 'release' : 'wait'
}
