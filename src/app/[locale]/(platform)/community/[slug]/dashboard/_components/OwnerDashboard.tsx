'use client'

import {
  ActivityIcon,
  CheckIcon,
  Code2Icon,
  PaintbrushIcon,
  PlusIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'

import type { CommunityTrust } from '@/components/communities/types'
import type { OwnerDashboard as OwnerDashboardData, OwnerMarketRow } from '@/lib/db/queries/owner-dashboard'

import { formatBps, formatCloseLabel, formatMoney, formatRating } from '@/components/communities/format'
import { EmptyState } from '@/components/communities/states/EmptyState'
import { LevelBadge } from '@/components/communities/trust/LevelBadge'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * The owner's one page: what the community earned, where every market is,
 * how far it is from the next level, who sits on the jury, and the doors to
 * the settings that already exist. Nothing to configure here; everything
 * links out.
 */

interface OwnerDashboardProps {
  community: { id: string; slug: string; name: string; iconUrl: string | null; memberCount: number; jurySize: number }
  trust: CommunityTrust | null
  dashboard: OwnerDashboardData
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
      <p className="text-[13px] font-semibold text-muted-foreground">{label}</p>
      <p className="text-[24px]/none font-bold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground tabular-nums">{hint}</p> : null}
    </div>
  )
}

function marketStateLabel(row: OwnerMarketRow, t: (key: string) => string): string {
  if (row.reviewStatus === 'pending') {
    return t('In review')
  }
  if (row.reviewStatus === 'rejected') {
    return t('Sent back')
  }
  if (row.status === 'cancelled' || row.poolState === 'cancelled') {
    return t('Refunded')
  }
  if (row.poolState === 'settled' || row.status === 'resolved') {
    return t('Resolved')
  }
  if (row.poolState === 'held') {
    return t('Payouts held')
  }
  if (row.poolState === 'closed') {
    return t('With the jury')
  }
  return t('Open')
}

export default function OwnerDashboard({ community, trust, dashboard }: OwnerDashboardProps) {
  const t = useExtracted()
  const locale = useLocale()
  const { earnings, markets, counts, ladder } = dashboard
  const currency = earnings.currency ?? trust?.currency ?? null
  const base = `/community/${community.slug}`
  const maxWeekly = earnings.weekly.reduce((max, week) => {
    const total = BigInt(week.ownerMinor) + BigInt(week.juryMinor)
    return total > max ? total : max
  }, 0n)
  const firstRun = markets.length === 0

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary">
            {community.iconUrl ? <img src={community.iconUrl} alt="" className="size-full object-cover" /> : null}
          </span>
          <div>
            <p className="text-[13px] font-semibold text-muted-foreground">{t('Owner dashboard')}</p>
            <h1 className="flex items-center gap-2 text-[24px]/tight font-bold">
              <Link href={base} className="hover:underline">
                {community.name}
              </Link>
              {trust ? <LevelBadge level={trust.level} name={trust.levelName} size="sm" /> : null}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href={`${base}/markets/new`} />}>
            <PlusIcon className="size-4" aria-hidden="true" />
            {t('Add market')}
          </Button>
          <Button variant="secondary" nativeButton={false} render={<Link href={`${base}/settings`} />}>
            <SettingsIcon className="size-4" aria-hidden="true" />
            {t('Settings')}
          </Button>
          <Button variant="secondary" nativeButton={false} render={<Link href={`${base}/theme`} />}>
            <PaintbrushIcon className="size-4" aria-hidden="true" />
            {t('Layout')}
          </Button>
          <Button variant="secondary" nativeButton={false} render={<Link href={`${base}/insights`} />}>
            <ActivityIcon className="size-4" aria-hidden="true" />
            {t('Insights')}
          </Button>
          <Button variant="secondary" nativeButton={false} render={<Link href={`${base}/embed-settings`} />}>
            <Code2Icon className="size-4" aria-hidden="true" />
            {t('Embed')}
          </Button>
        </div>
      </header>

      {firstRun ? (
        <section
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
          aria-label={t('Getting started')}
        >
          <h2 className="text-[17px] font-bold">{t('Three things before your first market')}</h2>
          <ol className="flex flex-col gap-2 text-sm">
            <li className="flex items-start gap-2">
              <CheckIcon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  community.memberCount > 1 ? 'text-foreground' : 'text-muted-foreground/40',
                )}
                aria-hidden="true"
              />
              <span>
                {t('Invite the people who will stake.')}{' '}
                <Link href={base} className="font-semibold underline underline-offset-[3px]">
                  {t('Invite link')}
                </Link>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckIcon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  (trust?.jurors.length ?? 0) >= community.jurySize ? 'text-foreground' : 'text-muted-foreground/40',
                )}
                aria-hidden="true"
              />
              <span>
                {t('Seat {size} jurors who will read the source and post a verdict.', {
                  size: String(community.jurySize),
                })}{' '}
                <Link href={`${base}/settings`} className="font-semibold underline underline-offset-[3px]">
                  {t('Members')}
                </Link>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground/40" aria-hidden="true" />
              <span>
                {t('Write a question with one source and one close time. Prophit checks it before it opens.')}{' '}
                <Link href={`${base}/markets/new`} className="font-semibold underline underline-offset-[3px]">
                  {t('Create a market')}
                </Link>
              </span>
            </li>
          </ol>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t('Numbers')}>
        <Kpi
          label={t('Your earnings, 30 days')}
          value={formatMoney(earnings.owner30dMinor, currency)}
          hint={t('{total} all time', { total: formatMoney(earnings.ownerAllTimeMinor, currency) })}
        />
        <Kpi
          label={t('Jury pay, 30 days')}
          value={formatMoney(earnings.jury30dMinor, currency)}
          hint={t('{total} all time', { total: formatMoney(earnings.juryAllTimeMinor, currency) })}
        />
        <Kpi
          label={t('Open markets')}
          value={String(counts.open)}
          hint={t('{closing} closing in 48h · {deciding} with the jury · {held} on hold', {
            closing: String(counts.closing48h),
            deciding: String(counts.deciding),
            held: String(counts.held),
          })}
        />
        <Kpi
          label={t('Members')}
          value={String(community.memberCount)}
          hint={t('of {max} at {level}', {
            max: String(trust?.caps.maxMembers ?? '—'),
            level: trust?.levelName ?? t('Level 0'),
          })}
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3" aria-label={t('Earnings')}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[17px] font-bold">{t('Earnings by week')}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {trust
                  ? t('{rake} of every pool, split between you, the jury and Prophit', {
                      rake: formatBps(trust.rakeBps),
                    })
                  : ''}
              </span>
            </div>
            {earnings.weekly.length === 0 ? (
              <p className="rounded-xl border border-dashed border-muted-foreground/40 p-4 text-sm text-muted-foreground">
                {t('Nothing paid out yet. Earnings land when a market resolves and its 24-hour hold ends.')}
              </p>
            ) : (
              <div className="flex h-40 items-end gap-2 rounded-xl border border-border bg-card p-4">
                {earnings.weekly.map((week) => {
                  const owner = BigInt(week.ownerMinor)
                  const jury = BigInt(week.juryMinor)
                  const total = owner + jury
                  const height = maxWeekly > 0n ? Number((total * 100n) / maxWeekly) : 0
                  const ownerShare = total > 0n ? Number((owner * 100n) / total) : 0
                  return (
                    <div
                      key={week.weekStart}
                      className="flex min-w-0 flex-1 flex-col items-center gap-1"
                      title={`${week.weekStart}: ${formatMoney(total, currency)}`}
                    >
                      <div
                        className="flex w-full flex-col justify-end overflow-hidden rounded-sm bg-secondary"
                        style={{ height: `${Math.max(4, height)}%` }}
                      >
                        <div className="w-full bg-foreground" style={{ height: `${ownerShare}%` }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{week.weekStart.slice(5)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3" aria-label={t('Markets')}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[17px] font-bold">{t('Markets')}</h2>
              {counts.inReview > 0 ? (
                <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                  {t('{count} in review', { count: String(counts.inReview) })}
                </span>
              ) : null}
            </div>
            {markets.length === 0 ? (
              <EmptyState
                dashed
                title={t('No markets yet')}
                body={t('Your first question opens after Prophit checks it.')}
                action={
                  <Button nativeButton={false} render={<Link href={`${base}/markets/new`} />}>
                    {t('Create a market')}
                  </Button>
                }
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-4 py-2.5 font-semibold">{t('Market')}</th>
                      <th className="px-4 py-2.5 font-semibold">{t('State')}</th>
                      <th className="hidden px-4 py-2.5 text-right font-semibold sm:table-cell">{t('Pool')}</th>
                      <th className="hidden px-4 py-2.5 text-right font-semibold md:table-cell">{t('Closes')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {markets.map((row) => (
                      <tr key={row.id}>
                        <td className="max-w-[260px] px-4 py-2.5">
                          <Link
                            href={`${base}/market/${row.id}`}
                            className="line-clamp-2 font-semibold hover:underline"
                          >
                            {row.title}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          {marketStateLabel(row, t)}
                        </td>
                        <td className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">
                          {formatMoney(row.poolMinor, row.currency ?? currency)}
                          <span className="ml-1 text-xs text-muted-foreground">· {row.stakeCount}</span>
                        </td>
                        <td className="hidden px-4 py-2.5 text-right whitespace-nowrap text-muted-foreground tabular-nums md:table-cell">
                          {row.closesAt ? formatCloseLabel(row.closesAt, locale) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
            aria-label={t('Trust & limits')}
          >
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="size-4" aria-hidden="true" />
              <h2 className="text-[15px] font-bold">{t('Trust & limits')}</h2>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm tabular-nums">
              <dt className="text-muted-foreground">{t('Trust score')}</dt>
              <dd>{trust?.trustScore ?? '—'} / 100</dd>
              <dt className="text-muted-foreground">{t('Record')}</dt>
              <dd>
                {t('{resolved} resolved · {late} late · {overturned} overturned', {
                  resolved: String(ladder.resolved),
                  late: String(ladder.late),
                  overturned: String(ladder.overturned),
                })}
              </dd>
              <dt className="text-muted-foreground">{t('Members cap')}</dt>
              <dd>{trust?.caps.maxMembers ?? '—'}</dd>
              <dt className="text-muted-foreground">{t('Pool cap')}</dt>
              <dd>{trust ? formatMoney(trust.caps.maxPoolPerMarketMinor, currency) : '—'}</dd>
              <dt className="text-muted-foreground">{t('Per person')}</dt>
              <dd>{trust ? formatMoney(trust.caps.maxPerPersonMinor, currency) : '—'}</dd>
              <dt className="text-muted-foreground">{t('Review')}</dt>
              <dd>
                {trust?.caps.reviewMode === 'every'
                  ? t('every market')
                  : trust?.caps.reviewMode === 'spot'
                    ? t('spot checks')
                    : trust?.caps.reviewMode === 'none'
                      ? t('none')
                      : '—'}
              </dd>
            </dl>
            {ladder.next ? (
              <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
                <p className="font-semibold">{t('To Level {level}', { level: String(ladder.next.nextLevel) })}</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-foreground"
                    style={{ width: `${(ladder.next.resolvedHave / ladder.next.resolvedNeeded) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t('{have} of {need} resolved on time', {
                    have: String(ladder.next.resolvedHave),
                    need: String(ladder.next.resolvedNeeded),
                  })}
                  {ladder.next.overturnedOk ? '' : ` · ${t('an overturned result blocks promotion')}`}
                </p>
              </div>
            ) : (
              <p className="border-t border-border pt-3 text-xs text-muted-foreground">
                {t('Top level. Keep resolving on time to stay here.')}
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3" aria-label={t('Jury')}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-bold">{t('Jury')}</h2>
              <Link
                href={`${base}/settings`}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                {t('Manage')}
              </Link>
            </div>
            {trust && trust.jurors.length > 0 ? (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {trust.jurors.map((juror) => (
                  <li key={juror.userId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="truncate font-semibold">{juror.username ? `@${juror.username}` : t('Juror')}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t('{count} markets', { count: String(juror.markets) })} · {formatRating(juror.rating)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-muted-foreground/40 p-4 text-sm text-muted-foreground">
                {t('No jurors seated yet.')}
              </p>
            )}
            <p className="text-xs text-muted-foreground tabular-nums">
              {t('{size} seats, {required} must agree. Seats grow with membership.', {
                size: String(trust?.jurySize ?? community.jurySize),
                required: String(trust?.juryRequired ?? Math.floor(community.jurySize / 2) + 1),
              })}
            </p>
          </section>

          <section className="flex flex-col gap-3" aria-label={t('Payouts')}>
            <h2 className="text-[15px] font-bold">{t('Your pay')}</h2>
            <p className="text-sm/relaxed text-muted-foreground">
              {t('Owner earnings land in your mobile money balance when each market pays out, after its hold.')}
            </p>
            <Button
              variant="secondary"
              nativeButton={false}
              render={<Link href={`${base}?sheet=withdraw`} />}
              className="justify-start"
            >
              <SmartphoneIcon className="size-4" aria-hidden="true" />
              {t('Withdraw')}
            </Button>
          </section>

          {ladder.events.length > 0 ? (
            <section className="flex flex-col gap-3" aria-label={t('Ladder history')}>
              <h2 className="text-[15px] font-bold">{t('Ladder history')}</h2>
              <ul className="flex flex-col gap-2 text-xs text-muted-foreground tabular-nums">
                {ladder.events.map((event) => (
                  <li key={event.id} className="flex justify-between gap-3">
                    <span>
                      {event.kind.replace(/_/g, ' ')}
                      {event.fromLevel !== null && event.toLevel !== null && event.fromLevel !== event.toLevel
                        ? ` ${event.fromLevel} → ${event.toLevel}`
                        : ''}
                      {event.reason ? ` · ${event.reason}` : ''}
                    </span>
                    <span className="shrink-0">{formatCloseLabel(event.at, locale)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
