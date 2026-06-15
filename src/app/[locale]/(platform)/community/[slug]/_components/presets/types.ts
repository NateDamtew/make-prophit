/**
 * Shared prop shape for every layout preset. Each preset is a function of
 * the same data — they just compose Phase 1's tab components and a few
 * preset-specific surfaces differently.
 */

import type { CommunityThemeState } from '@/lib/db/queries/community-theme'

interface PresetCommunity {
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
  resolution_date: Date | null
  event_id: string | null
  created_at: Date
  main_category_slug?: string | null
  category_slugs?: string[] | null
  votes?: { yes: number, no: number, disputed: number }
}

interface PresetReview {
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
}
