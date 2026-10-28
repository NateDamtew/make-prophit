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
  vote: string
  reasoning: string
  evidence_url: string | null
  voted_at: Date
  juror_username: string | null
  juror_image: string | null
  juror_id?: string
}

export type PoolSide = PoolOutcome

export function communityPath(communitySlug: string) {
  return `/community/${communitySlug}`
}
