import type { MetadataRoute } from 'next'

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/locales'
import { deferPublicShellPrerenderIfNeeded } from '@/lib/public-shell-rendering'
import resolveSiteUrl from '@/lib/site-url'

// SEO-tool and scraper crawlers that bring no visitors but walk every event page.
const BLOCKED_CRAWLERS = [
  'AhrefsBot',
  'SemrushBot',
  'MJ12bot',
  'DotBot',
  'BLEXBot',
  'DataForSeoBot',
  'PetalBot',
  'Bytespider',
]

// Event pages are crawled in the default locale only (the sitemap lists only
// those): each crawl of an uncached translated copy is a billed ISR write.
const TRANSLATED_EVENT_PATHS = SUPPORTED_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).flatMap((locale) => [
  `/${locale}/event/`,
  `/${locale}/sports/`,
  `/${locale}/esports/`,
])

export default async function robots(): Promise<MetadataRoute.Robots> {
  await deferPublicShellPrerenderIfNeeded()

  const siteUrl = resolveSiteUrl(process.env)

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', ...TRANSLATED_EVENT_PATHS],
      },
      {
        userAgent: BLOCKED_CRAWLERS,
        disallow: '/',
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
