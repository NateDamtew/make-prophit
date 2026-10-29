import type { PoolOutcome } from '@/lib/db/schema/pools/tables'

/**
 * Props shared by the pool market page components. The shapes mirror what
 * `CommunityRepository.getMarketWithCommunity` and `getVotes` return, kept
 * to the fields the page actually renders.
 */

export interface PoolMarketRecord {
  id: string
  title: string
  description: string | null
  image_url: string | null
  resolution_source: string | null
  resolution_rules: string | null
  resolution_date: Date | null
  status: string
  resolved_outcome: string | null
  resolved_at: Date | null
  event_id: string | null
  engine?: string | null
  market_mode?: string | null
  binary_outcome_yes?: string | null
  binary_outcome_no?: string | null
  created_at: Date
  // Jury seats (step 4); absent on markets from before seats existed.
  jury_seat_count?: number | null
  jury_required_votes?: number | null
  jury_deadline_at?: Date | null
  votes_revealed_at?: Date | null
  late_resolution?: boolean
}

export interface PoolCommunityRecord {
  id: string
  slug: string
  name: string
  icon_url: string | null
  jury_size: number
  type: string
}

export interface PoolJuryVote {
  id: string
  /** 'yes' | 'no' | 'disputed', or 'sealed' for another juror's vote before the reveal. */
  vote: string
  reasoning: string
  evidence_url: string | null
  source_type?: string | null
  voted_at: Date
  revealed_at?: Date | null
  was_late?: boolean
  overturned?: boolean
  correction_note?: string | null
  correction_note_at?: Date | null
  juror_username: string | null
  juror_image: string | null
  juror_id?: string
}

/** One seated juror, for the verdict list before the reveal. */
export interface MarketSeat {
  userId: string
  username: string | null
  image: string | null
}

/** What the viewer may do about appeals on this market. */
export interface AppealViewerState {
  staked: boolean
  stakeSide: 'yes' | 'no' | 'mixed' | null
  stakeMinor: string
  backedMinor: string
  availableMinor: string
  canFile: boolean
  canBack: boolean
  isFiler: boolean
}

/** The viewer's own seat on the market's jury. */
export interface ViewerJurySeat {
  seated: boolean
  voted: boolean
  vote: 'yes' | 'no' | 'disputed' | null
}

export type PoolSide = PoolOutcome

export function communityPath(communitySlug: string) {
  return `/community/${communitySlug}`
}
