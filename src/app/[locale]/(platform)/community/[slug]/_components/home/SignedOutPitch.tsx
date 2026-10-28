'use client'

import { useExtracted } from 'next-intl'

import type { CommunityTrust } from '@/components/communities/types'

import { formatMoney } from '@/components/communities/format'
import { Button } from '@/components/ui/button'
import { useAppKit } from '@/hooks/useAppKit'

import type { PresetMarket } from '../presets/types'

import PoolMarketCard from '../classic/PoolMarketCard'
import { poolTotal } from './market-groups'

/**
 * What a signed-out visitor sees first: the market they were sent to (or
 * the biggest one), who resolves it, and one button to sign up. Nothing
 * crypto, nothing to read before the first stake.
 */

interface SignedOutPitchProps {
  market: PresetMarket | null
  communityName: string
  communitySlug: string
  communityIconUrl: string | null
  trust: CommunityTrust | null
  currency: string | null
  volume30dMinor: string
  jurySize: number
}

export default function SignedOutPitch({
  market,
  communityName,
  communitySlug,
  communityIconUrl,
  trust,
  currency,
  volume30dMinor,
  jurySize,
}: SignedOutPitchProps) {
  const t = useExtracted()
  const { open: openAppKit } = useAppKit()
  const seats = trust?.jurySize ?? jurySize
  const required = trust?.juryRequired ?? Math.floor(seats / 2) + 1
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5" aria-label={t('Join')}>
      <div className="flex flex-col gap-1">
        <h2 className="text-[20px]/tight font-bold">{t('Make your call in {name}', { name: communityName })}</h2>
        <p className="text-sm/relaxed text-muted-foreground tabular-nums">
          {t(
            '{required} of {seats} jurors resolve every question and post why. Payouts wait {hours} hours so anyone can appeal.',
            {
              required: String(required),
              seats: String(seats),
              hours: String(trust?.holdHours ?? 24),
            },
          )}
          {BigInt(volume30dMinor) > 0n
            ? ` ${t('{volume} staked in the last 30 days.', { volume: formatMoney(volume30dMinor, currency) })}`
            : ''}
        </p>
      </div>
      {market && poolTotal(market) >= 0n ? (
        <PoolMarketCard
          market={market}
          communitySlug={communitySlug}
          communityIconUrl={communityIconUrl}
          jurySize={seats}
        />
      ) : null}
      <Button
        size="lg"
        className="h-12 w-full rounded-md text-base font-bold shadow-lg shadow-primary/20 sm:w-auto sm:self-start"
        onClick={() => void openAppKit()}
      >
        {t('Sign up with your email')}
      </Button>
      <p className="text-xs text-muted-foreground">
        {t('Takes a minute. Stakes start from the smallest amount the community allows.')}
      </p>
    </section>
  )
}
