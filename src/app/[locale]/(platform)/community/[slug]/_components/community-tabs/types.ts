/**
 * Shared types for the community tab system. Keeping these in one place lets
 * each tab file (Markets, Members, Jury, Reviews, About, Comments, Activity)
 * import only what it needs and stay narrow.
 */

export interface CommunitySummary {
  id: string
  slug: string
  name: string
  description: string | null
  rules: string | null
  terms: string | null
  jury_size: number
  max_members: number
  type: string
  created_at: Date
}

export interface CommunityMemberSummary {
  user_id: string
  role: string
  username: string | null
  image: string | null
  joined_at: Date
}

export interface CommunityMarketSummary {
  id: string
  title: string
  description: string | null
  resolution_source: string | null
  resolution_rules: string | null
  status: string
  resolved_outcome: string | null
  resolution_date: Date | null
  event_id: string | null
  created_at: Date
  votes?: { yes: number, no: number, disputed: number }
}

export interface CommunityReviewSummary {
  id: string
  rating: number
  review_text: string | null
  created_at: Date
  username: string | null
  user_image: string | null
}

export interface CommunityTabContext {
  community: CommunitySummary
  members: CommunityMemberSummary[]
  markets: CommunityMarketSummary[]
  reviews: CommunityReviewSummary[]
  memberRole: string | null
  currentUserId: string | null
}

export type CommunityTabId = 'markets' | 'activity' | 'members' | 'jury' | 'reviews' | 'about'
