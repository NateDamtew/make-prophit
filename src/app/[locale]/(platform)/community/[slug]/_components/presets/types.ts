/**
 * Shared prop shape for every home layout. Each layout is a function of the
 * same data: the community, its markets with pool totals, the trust card,
 * and the viewer's own stakes. They only compose the home sections
 * differently.
 */

import type { CommunityTrust } from '@/components/communities/types'
import type { CommunityHome } from '@/lib/db/queries/community-home'
import type { CommunityThemeState } from '@/lib/db/queries/community-theme'
import type { PoolCardSummary } from '@/lib/pools/activity'

export interface PresetCommunity {
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
  is_verified?: boolean | null
  icon_url?: string | null
  banner_url?: string | null
}

export interface PresetMember {
  user_id: string
  role: string
  username: string | null
  image: string | null
  joined_at: Date
}

export interface PresetMarket {
  id: string
  title: string
  description: string | null
  resolution_source: string | null
  resolution_rules: string | null
  status: string
  resolved_outcome: string | null
  resolved_at?: Date | null
  resolution_date: Date | null
  event_id: string | null
  created_at: Date
  main_category_slug?: string | null
  category_slugs?: string[] | null
  votes?: { yes: number; no: number; disputed: number }
  image_url?: string | null
  engine?: string | null
  /** Fork: pool totals for pool-engine markets (null when the market has no pool). */
  pool?: PoolCardSummary | null
}

export interface PresetReview {
  id: string
  rating: number
  review_text: string | null
  created_at: Date
  username: string | null
  user_image: string | null
}

export interface PresetProps {
  community: PresetCommunity
  members: PresetMember[]
  markets: PresetMarket[]
  reviews: PresetReview[]
  memberRole: string | null
  currentUserId: string | null
  theme: CommunityThemeState
  trust: CommunityTrust | null
  home: CommunityHome
  /** Market pinned by a shared link (`?m=`), shown first to signed-out visitors. */
  pinnedMarketId: string | null
  /** Render-time clock; the client ticks on from here. */
  serverNow: number
}
