'use client'

import { useMemo } from 'react'

import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { isOwnerRole } from '@/lib/communities/roles'

import type { PresetProps } from '../presets/types'

import { groupMarkets, leadMarket } from './market-groups'

/**
 * What every layout derives from the shared props: the market groups, the
 * lead market, whether the viewer leads the community, and the clock.
 */
export function useHomeData(props: PresetProps) {
  const tick = useNowTimestamp()
  const now = tick ?? props.serverNow
  const groups = useMemo(() => groupMarkets(props.markets, now), [props.markets, now])
  const lead = useMemo(
    () => leadMarket(props.markets, now, props.pinnedMarketId),
    [props.markets, now, props.pinnedMarketId],
  )
  return {
    now,
    groups,
    lead,
    isOwner: isOwnerRole(props.memberRole),
    signedIn: props.currentUserId !== null,
    iconUrl: props.community.icon_url ?? null,
  }
}
