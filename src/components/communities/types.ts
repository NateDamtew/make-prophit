import type { CommunityLevel, CommunityStatus, LeaderType, ReviewMode } from '@/lib/communities/rules'

/**
 * Client-safe shapes shared by the Communities UI. Money is carried as
 * strings of minor units (bigint does not survive the RSC boundary).
 */

export interface TrustJuror {
  userId: string
  username: string | null
  image: string | null
  isOwner: boolean
  /** Markets this juror has voted on in this community. */
  markets: number
  /** Average rating from losing stakers, 1–5. Null until ratings exist. */
  rating: number | null
}

export interface TrustCaps {
  maxMembers: number
  maxPoolPerMarketMinor: string
  maxPerPersonMinor: string
  reviewMode: ReviewMode
}

export interface CommunityTrust {
  communityId: string
  currency: string | null
  level: CommunityLevel
  levelName: string
  /** 0–100, null until the nightly job has scored the community. */
  trustScore: number | null
  status: CommunityStatus
  joinsPaused: boolean
  isVerified: boolean
  leaderType: LeaderType | null
  memberCount: number
  jurySize: number
  juryRequired: number
  jurors: TrustJuror[]
  resolved: number
  overturned: number
  /** Percentage of markets resolved on time. Null until the jury-seats work lands. */
  onTimePct: number | null
  caps: TrustCaps
  /** Pool share in basis points (700 = 7%). */
  rakeBps: number
  holdHours: number
}
