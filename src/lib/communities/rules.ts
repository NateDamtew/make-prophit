/**
 * Pure rules for Communities v1: jury size by community size, majority
 * verdicts, the join gate and the caps that come with each trust level.
 * No database imports — safe for client components and unit tests.
 *
 * See notes/COMMUNITIES-CONCEPT.md §3 and §4.
 */

export type CommunityLevel = 0 | 1 | 2

export const LEVEL_NAMES: Record<CommunityLevel, string> = {
  0: 'New',
  1: 'Proven',
  2: 'Established',
}

export type LeaderType = 'news' | 'sports' | 'creator' | 'show' | 'group' | 'event'

const LEADER_TYPES: readonly LeaderType[] = ['news', 'sports', 'creator', 'show', 'group', 'event']

export type CommunityStatus = 'active' | 'paused' | 'dormant' | 'archived'

export type ReviewMode = 'every' | 'spot' | 'none'

/** A jury band: communities up to `maxMembers` members seat `seats` jurors. `null` = no upper bound. */
export interface JuryBand {
  maxMembers: number | null
  seats: number
}

/** Juries grow with the community and are always odd, so a vote never ties. Never more than 10. */
export const DEFAULT_JURY_BANDS: readonly JuryBand[] = [
  { maxMembers: 500, seats: 3 },
  { maxMembers: 2_000, seats: 5 },
  { maxMembers: 5_000, seats: 7 },
  { maxMembers: null, seats: 9 },
]

const MAX_JURY_SEATS = 10

/** Seats a community of `memberCount` members needs. */
export function jurySeatsForMembers(memberCount: number, bands: readonly JuryBand[] = DEFAULT_JURY_BANDS): number {
  const count = Math.max(0, Math.floor(memberCount))
  for (const band of bands) {
    if (band.maxMembers === null || count <= band.maxMembers) {
      return Math.min(MAX_JURY_SEATS, Math.max(1, band.seats))
    }
  }
  const last = bands[bands.length - 1]
  return Math.min(MAX_JURY_SEATS, Math.max(1, last?.seats ?? 3))
}

/** Votes needed for a verdict: a simple majority of the seats (3→2, 5→3, 7→4, 9→5). */
export function majorityOf(seats: number): number {
  const n = Math.max(1, Math.floor(seats))
  return Math.floor(n / 2) + 1
}

/** The band a community of `memberCount` members is in (for "up to 2,000 members" copy). */
export function juryBandForMembers(
  memberCount: number,
  bands: readonly JuryBand[] = DEFAULT_JURY_BANDS,
): JuryBand & { minMembers: number } {
  const count = Math.max(0, Math.floor(memberCount))
  let minMembers = 0
  for (const band of bands) {
    if (band.maxMembers === null || count <= band.maxMembers) {
      return { ...band, minMembers }
    }
    minMembers = band.maxMembers + 1
  }
  const last = bands[bands.length - 1] ?? { maxMembers: null, seats: 3 }
  return { ...last, minMembers }
}

export interface JoinGateInput {
  memberCount: number
  /** Jurors who are seated AND have cast at least one vote in this community. */
  activeJurors: number
  /** Hard cap from the community's level (or override). */
  maxMembers: number
  status: CommunityStatus
  bands?: readonly JuryBand[]
}

export type JoinGateReason = 'full' | 'jury_too_small' | 'paused' | 'dormant' | 'archived' | null

/**
 * Whether one more member may join. A community can't grow past its jury
 * band until it has seated (and activated) enough jurors for the next one,
 * and never past its level's member cap.
 */
export function computeJoinGate(input: JoinGateInput): {
  allowed: boolean
  reason: JoinGateReason
  seatsNeeded: number
} {
  const bands = input.bands ?? DEFAULT_JURY_BANDS
  const nextCount = Math.max(0, Math.floor(input.memberCount)) + 1
  const seatsNeeded = jurySeatsForMembers(nextCount, bands)

  if (input.status === 'archived') {
    return { allowed: false, reason: 'archived', seatsNeeded }
  }
  if (input.status === 'paused') {
    return { allowed: false, reason: 'paused', seatsNeeded }
  }
  if (input.status === 'dormant') {
    return { allowed: false, reason: 'dormant', seatsNeeded }
  }
  if (nextCount > input.maxMembers) {
    return { allowed: false, reason: 'full', seatsNeeded }
  }
  // Inside the first band a brand-new community has no active jurors yet; the
  // gate only bites once the community would cross into a bigger band.
  const currentSeats = jurySeatsForMembers(Math.max(1, input.memberCount), bands)
  if (seatsNeeded > currentSeats && input.activeJurors < seatsNeeded) {
    return { allowed: false, reason: 'jury_too_small', seatsNeeded }
  }
  return { allowed: true, reason: null, seatsNeeded }
}

/** Everything a level decides. Money in minor units (cents of the community currency). */
export interface LevelCaps {
  level: CommunityLevel
  name: string
  /** Pool share taken from every settled pool, in basis points (800 = 8%). */
  rakeBps: number
  /** How the pool share is split, in basis points of the rake; the three sum to 10,000. */
  ownerShareBps: number
  juryShareBps: number
  prophitShareBps: number
  maxMembers: number
  maxPoolPerMarketMinor: bigint
  maxPerPersonMinor: bigint
  reviewMode: ReviewMode
  /** For `spot`: the fraction of new markets that go to Prophit review (0–1). */
  spotCheckRate: number
}

/** Per-level caps for KES; other currencies fall back to these until a settings row is saved for them. */
export const DEFAULT_LEVEL_CAPS: Record<CommunityLevel, LevelCaps> = {
  0: {
    level: 0,
    name: LEVEL_NAMES[0],
    rakeBps: 800,
    ownerShareBps: 4_000,
    juryShareBps: 2_000,
    prophitShareBps: 4_000,
    maxMembers: 500,
    maxPoolPerMarketMinor: 2_000_000n, // 20,000 KES
    maxPerPersonMinor: 200_000n, // 2,000 KES
    reviewMode: 'every',
    spotCheckRate: 1,
  },
  1: {
    level: 1,
    name: LEVEL_NAMES[1],
    rakeBps: 700,
    ownerShareBps: 4_000,
    juryShareBps: 2_000,
    prophitShareBps: 4_000,
    maxMembers: 2_000,
    maxPoolPerMarketMinor: 10_000_000n, // 100,000 KES
    maxPerPersonMinor: 200_000n,
    reviewMode: 'spot',
    spotCheckRate: 0.2,
  },
  2: {
    level: 2,
    name: LEVEL_NAMES[2],
    rakeBps: 600,
    ownerShareBps: 4_000,
    juryShareBps: 2_000,
    prophitShareBps: 4_000,
    maxMembers: 5_000,
    maxPoolPerMarketMinor: 50_000_000n, // 500,000 KES
    maxPerPersonMinor: 500_000n, // 5,000 KES
    reviewMode: 'none',
    spotCheckRate: 0,
  },
}

/** Partial per-community override saved by Prophit admins (`communities.caps_override`). */
export interface CapsOverride {
  maxMembers?: number
  maxPoolPerMarketMinor?: bigint
  maxPerPersonMinor?: bigint
}

export function getEffectiveCaps(
  base: LevelCaps,
  override: CapsOverride | null | undefined,
  reviewModeOverride: ReviewMode | null | undefined,
): LevelCaps {
  return {
    ...base,
    maxMembers: override?.maxMembers ?? base.maxMembers,
    maxPoolPerMarketMinor: override?.maxPoolPerMarketMinor ?? base.maxPoolPerMarketMinor,
    maxPerPersonMinor: override?.maxPerPersonMinor ?? base.maxPerPersonMinor,
    reviewMode: reviewModeOverride ?? base.reviewMode,
  }
}

export function isCommunityLevel(value: unknown): value is CommunityLevel {
  return value === 0 || value === 1 || value === 2
}

export function isLeaderType(value: unknown): value is LeaderType {
  return typeof value === 'string' && (LEADER_TYPES as readonly string[]).includes(value)
}
