'use client'

import { GavelIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'

import { formatCloseLabel, initials } from '@/components/communities/format'
import { Button } from '@/components/ui/button'
import { useNowTimestamp } from '@/hooks/useNowTimestamp'
import { Link } from '@/i18n/navigation'
import { isJurorRole, isOwnerRole, ROLE_LABELS } from '@/lib/communities/roles'
import { DEFAULT_JURY_BANDS, juryBandForMembers, majorityOf } from '@/lib/communities/rules'
import { cn } from '@/lib/utils'

import type { CommunityMarketSummary, CommunityMemberSummary, CommunitySummary } from './types'

/**
 * Who decides markets here and how: the seated jurors, the band the
 * community is in (jury size grows with members), and, for a juror, the
 * closed markets waiting on a vote. Votes are cast on the jury page.
 */

interface JuryTabProps {
  community: CommunitySummary
  members: CommunityMemberSummary[]
  markets: CommunityMarketSummary[]
  isJuror: boolean
}

export function JuryTab({ community, members, markets, isJuror }: JuryTabProps) {
  const t = useExtracted()
  const locale = useLocale()
  const now = useNowTimestamp()
  const jurors = members.filter((member) => isJurorRole(member.role))
  const required = majorityOf(community.jury_size)
  const band = juryBandForMembers(members.length)
  const waiting = isJuror
    ? markets.filter(
        (market) =>
          market.status === 'active' &&
          market.resolution_date !== null &&
          now !== null &&
          new Date(market.resolution_date).getTime() <= now,
      )
    : []

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[15px] font-semibold tabular-nums">
          {t('{seated} of {size} jury seats filled · {required} must agree', {
            seated: String(jurors.length),
            size: String(community.jury_size),
            required: String(required),
          })}
        </p>
        <p className="mt-1 text-sm/relaxed text-muted-foreground">
          {t(
            'Jurors read the source after a market closes and post a sealed verdict with a reason. Votes open together, and a missed deadline refunds everyone.',
          )}
        </p>
        <table className="mt-3 w-full text-sm tabular-nums">
          <caption className="sr-only">{t('Jury size by community size')}</caption>
          <tbody>
            {DEFAULT_JURY_BANDS.map((row) => {
              const current = row.seats === band.seats && row.maxMembers === band.maxMembers
              return (
                <tr key={row.seats} className={cn('border-t border-border', current && 'font-semibold')}>
                  <td className="py-1.5 text-muted-foreground">
                    {row.maxMembers === null
                      ? t('Over {count} members', {
                          count: DEFAULT_JURY_BANDS.at(-2)?.maxMembers?.toLocaleString(locale) ?? '',
                        })
                      : t('Up to {count} members', { count: row.maxMembers.toLocaleString(locale) })}
                  </td>
                  <td className="py-1.5 text-right">
                    {t('{seats} jurors, {required} agree', {
                      seats: String(row.seats),
                      required: String(majorityOf(row.seats)),
                    })}
                    {current ? <span className="ml-2 text-xs text-primary">{t('now')}</span> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {waiting.length > 0 && (
        <section className="flex flex-col gap-2" aria-label={t('Waiting on your vote')}>
          <h3 className="text-[15px] font-bold">{t('Waiting on the jury')}</h3>
          {waiting.map((market) => (
            <div key={market.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{market.title}</p>
                {market.resolution_date ? (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t('Closed {time}', { time: formatCloseLabel(market.resolution_date, locale, now) })}
                  </p>
                ) : null}
              </div>
              <Button size="sm" nativeButton={false} render={<Link href={`/jury/${market.id}`} />}>
                <GavelIcon className="size-4" aria-hidden="true" />
                {t('Vote')}
              </Button>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2" aria-label={t('Jurors')}>
        <h3 className="text-[15px] font-bold">{t('Jurors')}</h3>
        {jurors.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('Jurors are appointed by the community leader.')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {jurors.map((juror) => (
              <li key={juror.user_id} className="flex items-center gap-3 px-4 py-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold">
                  {juror.image ? (
                    <img src={juror.image} alt="" className="size-full object-cover" />
                  ) : (
                    initials(juror.username)
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {juror.username ? (
                      <Link
                        href={`/profile/@${juror.username}?tab=jury`}
                        className="underline-offset-2 hover:underline"
                      >
                        @{juror.username}
                      </Link>
                    ) : (
                      t('Juror')
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isOwnerRole(juror.role) ? t('Leader, sits on the jury') : ROLE_LABELS.juror}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
