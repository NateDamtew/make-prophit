import type { Metadata } from 'next'
import type { SupportedLocale } from '@/i18n/locales'
import { setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import EventContent from '@/app/[locale]/(platform)/event/[slug]/_components/EventContent'
import EventStructuredData from '@/components/seo/EventStructuredData'
import { redirect } from '@/i18n/navigation'
import { buildTranslatedEventFaqItems } from '@/lib/event-faq-server'
import { buildEventPageMetadata } from '@/lib/event-open-graph'
import { getEventRouteBySlug, loadEventPagePublicContentData } from '@/lib/event-page-data'
import { resolveEventBasePath, resolveEventPagePath } from '@/lib/events-routing'
import { STATIC_PARAMS_PLACEHOLDER } from '@/lib/static-params'
import { loadRuntimeThemeState } from '@/lib/theme-settings'

export async function generateStaticParams() {
  return [{ slug: STATIC_PARAMS_PLACEHOLDER }]
}

export async function generateMetadata({ params }: PageProps<'/[locale]/event/[slug]'>): Promise<Metadata> {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const resolvedLocale = locale as SupportedLocale
  if (slug === STATIC_PARAMS_PLACEHOLDER) {
    notFound()
  }
  return await buildEventPageMetadata({
    eventSlug: slug,
    locale: resolvedLocale,
  })
}

async function CachedEventPageContent({
  locale,
  slug,
}: {
  locale: SupportedLocale
  slug: string
}) {
  'use cache'

  const eventRoute = await getEventRouteBySlug(slug)
  if (!eventRoute) {
    notFound()
  }

  const sportsPath = resolveEventBasePath(eventRoute)
  if (sportsPath) {
    redirect({
      href: sportsPath,
      locale,
    })
  }

  const [eventPageData, runtimeTheme] = await Promise.all([
    loadEventPagePublicContentData(slug, locale),
    loadRuntimeThemeState(),
  ])
  if (!eventPageData) {
    notFound()
  }

  const faqItems = await buildTranslatedEventFaqItems({
    event: eventPageData.event,
    siteName: runtimeTheme.site.name,
    locale,
  })

  return (
    <>
      <EventStructuredData
        event={eventPageData.event}
        locale={locale}
        pagePath={resolveEventPagePath(eventPageData.event)}
        site={runtimeTheme.site}
        faqItems={faqItems}
      />
      <EventContent
        event={eventPageData.event}
        faqItems={faqItems}
        marketContextEnabled={eventPageData.marketContextEnabled}
        seriesEvents={eventPageData.seriesEvents}
        liveChartConfig={eventPageData.liveChartConfig}
        key={`is-bookmarked-${eventPageData.event.is_bookmarked}`}
      />
    </>
  )
}

async function gateCommunityEventAccess(slug: string) {
  const { db } = await import('@/lib/drizzle')
  const { events } = await import('@/lib/db/schema/events/tables')
  const { community_members } = await import('@/lib/db/schema/communities/tables')
  const { UserRepository } = await import('@/lib/db/queries/user')
  const { eq, and } = await import('drizzle-orm')

  const [row] = await db
    .select({ community_id: events.community_id })
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1)

  if (!row?.community_id) {
    return // public event, no gate
  }

  const user = await UserRepository.getCurrentUser({ minimal: true })
  if (!user) {
    notFound()
  }

  const [member] = await db
    .select({ user_id: community_members.user_id })
    .from(community_members)
    .where(and(
      eq(community_members.community_id, row.community_id),
      eq(community_members.user_id, user.id),
    ))
    .limit(1)

  if (!member) {
    notFound()
  }
}

export default async function EventPage({ params }: PageProps<'/[locale]/event/[slug]'>) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const resolvedLocale = locale as SupportedLocale
  if (slug === STATIC_PARAMS_PLACEHOLDER) {
    notFound()
  }

  await gateCommunityEventAccess(slug)

  return <CachedEventPageContent locale={resolvedLocale} slug={slug} />
}
