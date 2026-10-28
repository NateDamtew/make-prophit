'use client'

import { CheckIcon, ClockIcon, MessageSquareIcon, XIcon } from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'

import type { ApplicationView } from '@/lib/db/queries/applications'

import { formatCloseLabel } from '@/components/communities/format'
import { LeaderTypeBadge } from '@/components/communities/trust/LeaderTypeBadge'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'

/**
 * Where an application stands: waiting, needs more, approved (with the
 * door to the new community) or declined with the note.
 */

export default function ApplicationStatus({ application }: { application: ApplicationView }) {
  const t = useExtracted()
  const locale = useLocale()
  const icon =
    application.status === 'approved'
      ? CheckIcon
      : application.status === 'rejected'
        ? XIcon
        : application.status === 'more_info'
          ? MessageSquareIcon
          : ClockIcon
  const Icon = icon
  const title =
    application.status === 'approved'
      ? t('Approved. Your community is ready.')
      : application.status === 'rejected'
        ? t('Not this time')
        : application.status === 'more_info'
          ? t('We need a little more')
          : t('Application received')
  const body =
    application.status === 'approved'
      ? t('You start at Level {level}. Seat your jurors, then post your first market.', {
          level: String(application.startLevel ?? 0),
        })
      : application.status === 'rejected'
        ? (application.adminNote ?? t('Prophit could not approve this application.'))
        : application.status === 'more_info'
          ? (application.adminNote ?? t('Prophit asked for more detail. Update your application below.'))
          : t('Prophit reads every application. You will hear back within a few days, here and by email.')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5">
        <span className="flex size-11 items-center justify-center rounded-full bg-secondary">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h1 className="text-[22px]/tight font-bold">{title}</h1>
        <p className="text-sm/relaxed text-muted-foreground">{body}</p>
        {application.status === 'approved' && application.communityId ? (
          <Button nativeButton={false} render={<Link href={`/community/${application.slug}/dashboard`} />}>
            {t('Open your dashboard')}
          </Button>
        ) : null}
        {application.status === 'more_info' ? (
          <Button nativeButton={false} render={<Link href="/communities/apply?edit=1" />}>
            {t('Update application')}
          </Button>
        ) : null}
      </div>
      <dl className="grid gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-5 text-sm sm:grid-cols-[140px_1fr]">
        <dt className="text-muted-foreground">{t('Community')}</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{application.name}</span>
          <span className="text-muted-foreground">/community/{application.slug}</span>
          <LeaderTypeBadge type={application.leaderType} className="h-5 text-[11px]" />
        </dd>
        <dt className="text-muted-foreground">{t('About')}</dt>
        <dd>{application.description}</dd>
        {application.audience ? (
          <>
            <dt className="text-muted-foreground">{t('Audience')}</dt>
            <dd>{application.audience}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">{t('Sample markets')}</dt>
        <dd>
          <ul className="list-disc pl-4">
            {application.sampleMarkets.map((market, index) => (
              <li key={index}>
                {market.title} <span className="text-muted-foreground">· {market.source}</span>
              </li>
            ))}
          </ul>
        </dd>
        <dt className="text-muted-foreground">{t('Sent')}</dt>
        <dd className="tabular-nums">{formatCloseLabel(application.createdAt, locale)}</dd>
      </dl>
      <p className="text-xs text-muted-foreground">
        <Link href="/communities" className="underline underline-offset-[3px]">
          {t('Back to communities')}
        </Link>
      </p>
    </div>
  )
}
