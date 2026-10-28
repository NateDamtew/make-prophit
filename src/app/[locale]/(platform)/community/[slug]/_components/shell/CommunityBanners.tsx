'use client'

import { useExtracted } from 'next-intl'

import type { CommunityTrust } from '@/components/communities/types'

import { Banner } from '@/components/communities/states/Banner'

/**
 * Calm notices at the top of the home: paused, dormant, Level 0 review,
 * joins paused. One at a time, the most important first.
 */

interface CommunityBannersProps {
  trust: CommunityTrust | null
  isOwner: boolean
  /** Dev preview override (`?preview=paused|dormant|level0`). */
  preview?: 'paused' | 'dormant' | 'level0' | null
}

export default function CommunityBanners({ trust, isOwner, preview = null }: CommunityBannersProps) {
  const t = useExtracted()
  const status = preview === 'paused' ? 'paused' : preview === 'dormant' ? 'dormant' : trust?.status
  const level = preview === 'level0' ? 0 : trust?.level

  if (status === 'paused') {
    return (
      <Banner
        tone="paused"
        title={t('This community is paused')}
        body={
          isOwner
            ? t(
                'Prophit paused new stakes while a dispute is reviewed. Open markets still resolve and pay. You will hear from us.',
              )
            : t('New stakes are paused while Prophit reviews a dispute. Open markets still resolve and pay.')
        }
      />
    )
  }
  if (status === 'dormant') {
    return (
      <Banner
        tone="dormant"
        title={t('Quiet lately')}
        body={
          isOwner
            ? t(
                'No market has opened in 30 days. Post one and the community wakes up; levels and jury stay as they are.',
              )
            : t('No new markets in the last 30 days. Settled markets have been paid.')
        }
      />
    )
  }
  if (level === 0 && isOwner) {
    return (
      <Banner
        tone="level0"
        title={t('Level 0: every market is checked before it opens')}
        body={t(
          'Prophit reads each new market first. Resolve 10 on time with no overturned result and you move to Level 1, where only spot checks apply.',
        )}
      />
    )
  }
  if (trust?.joinsPaused && !isOwner) {
    return (
      <Banner
        tone="review"
        title={t('Joins are paused')}
        body={t('The leader has paused new members for now. You can still read every market and verdict.')}
      />
    )
  }
  return null
}
