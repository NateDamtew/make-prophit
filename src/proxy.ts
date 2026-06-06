import type { NextRequest } from 'next/server'
import createMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  buildPredictionResultsInternalRoutePath,
  hasPredictionResultsFilterSearchParams,
  PREDICTION_RESULTS_SORT_PARAM,
  PREDICTION_RESULTS_STATUS_PARAM,
  resolvePredictionResultsFiltersFromSearchParams,
} from '@/lib/prediction-results-filters'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)
const protectedPrefixes = ['/settings', '/portfolio', '/admin']
type Locale = (typeof routing.locales)[number]

function getLocaleFromPathname(pathname: string): Locale | null {
  for (const locale of routing.locales) {
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) {
      return locale
    }
  }
  return null
}

function resolveRequestLocale(pathnameLocale: Locale | null): Locale {
  return pathnameLocale ?? routing.defaultLocale
}

function stripLocale(pathname: string, locale: Locale | null) {
  if (!locale) {
    return pathname
  }
  const withoutLocale = pathname.slice(locale.length + 1)
  return withoutLocale.startsWith('/') ? withoutLocale : '/'
}

function withLocale(pathname: string, locale: Locale | null) {
  if (!locale || locale === routing.defaultLocale) {
    return pathname
  }
  return pathname === '/' ? `/${locale}` : `/${locale}${pathname}`
}

function withExplicitLocale(pathname: string, locale: Locale) {
  return pathname === '/' ? `/${locale}` : `/${locale}${pathname}`
}

function resolvePredictionResultsRewrite({
  pathname,
  searchParams,
}: {
  pathname: string
  searchParams: URLSearchParams
}) {
  if (!hasPredictionResultsFilterSearchParams(searchParams)) {
    return null
  }

  if (!/^\/predictions\/[^/]+$/.test(pathname)) {
    return null
  }

  const filters = resolvePredictionResultsFiltersFromSearchParams(searchParams)
  const rewrittenSearchParams = new URLSearchParams(searchParams.toString())

  rewrittenSearchParams.delete(PREDICTION_RESULTS_SORT_PARAM)
  rewrittenSearchParams.delete(PREDICTION_RESULTS_STATUS_PARAM)

  return {
    pathname: buildPredictionResultsInternalRoutePath(pathname, filters),
    search: rewrittenSearchParams.toString(),
  }
}

/**
 * Gate direct URL access to community-owned event pages.
 * Non-members get redirected to home (404 would leak existence).
 * Failures fail-open so DB hiccups don't break event pages.
 */
async function isCommunityEventBlocked(slug: string, userId: string | undefined): Promise<boolean> {
  try {
    const { db } = await import('@/lib/drizzle')
    const { events } = await import('@/lib/db/schema/events/tables')
    const { community_members } = await import('@/lib/db/schema/communities/tables')
    const { eq, and } = await import('drizzle-orm')

    const [row] = await db
      .select({ community_id: events.community_id })
      .from(events)
      .where(eq(events.slug, slug))
      .limit(1)

    if (!row?.community_id) {
      return false // public event, no gate
    }
    if (!userId) {
      return true // logged-out user accessing community event
    }

    const [member] = await db
      .select({ user_id: community_members.user_id })
      .from(community_members)
      .where(and(
        eq(community_members.community_id, row.community_id),
        eq(community_members.user_id, userId),
      ))
      .limit(1)

    return !member
  }
  catch (err) {
    console.warn('[isCommunityEventBlocked] Fail-open due to error:', err)
    return false
  }
}

export default async function proxy(request: NextRequest) {
  const url = new URL(request.url)
  const host = request.headers.get('host') || ''
  
  // ─── Landing Page Routing ────────────────────────────────────────────────
  // Isolate the base domain, clean port if present
  const hostname = host.split(':')[0]
  const isPlatformDomain = hostname === 'beta.makeprophit.com' || hostname === 'tma.makeprophit.com'
  const isLandingDomain = !isPlatformDomain && (
    hostname === 'makeprophit.com' ||
    hostname === 'www.makeprophit.com' ||
    hostname === 'localhost'
  )

  if (isLandingDomain) {
    if (url.pathname === '/' || url.pathname === '/en' || url.pathname === '/zh' || url.pathname === '/ru') {
      const landingLocale = url.pathname === '/' ? 'en' : url.pathname.replace('/', '')
      const rewrittenUrl = new URL(`/${landingLocale}/landing`, request.url)
      return NextResponse.rewrite(rewrittenUrl)
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const pathnameLocale = getLocaleFromPathname(url.pathname)
  const pathname = stripLocale(url.pathname, pathnameLocale)
  const locale = resolveRequestLocale(pathnameLocale)
  const predictionResultsRewrite = resolvePredictionResultsRewrite({
    pathname,
    searchParams: url.searchParams,
  })

  if (predictionResultsRewrite) {
    const rewrittenUrl = new URL(withExplicitLocale(predictionResultsRewrite.pathname, locale), request.url)
    rewrittenUrl.search = predictionResultsRewrite.search
    return NextResponse.rewrite(rewrittenUrl)
  }

  // ─── Community event access gate ─────────────────────────────────────────
  // /event/[slug] pages for community-owned events should only be
  // accessible to community members. Redirect non-members to home.
  const eventSlugMatch = pathname.match(/^\/event\/([^/]+)/)
  if (eventSlugMatch) {
    const slug = decodeURIComponent(eventSlugMatch[1])
    const sessionForGate = await auth.api.getSession({ headers: request.headers })
    const blocked = await isCommunityEventBlocked(slug, sessionForGate?.user?.id)
    if (blocked) {
      return NextResponse.redirect(new URL(withLocale('/', locale), request.url))
    }
  }

  const isProtected = protectedPrefixes.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )

  if (!isProtected) {
    return intlMiddleware(request)
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    return NextResponse.redirect(new URL(withLocale('/', locale), request.url))
  }

  if (pathname.startsWith('/admin')) {
    if (!session.user?.is_admin) {
      return NextResponse.redirect(new URL(withLocale('/', locale), request.url))
    }
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: [
    '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
  ],
}
