import { CommunityDiscoveryRepository } from '@/lib/db/queries/community-discovery'
import resolveSiteUrl from '@/lib/site-url'

/**
 * Public sitemap for communities + community markets. Lives at a stable URL
 * so search engines can be pointed at it via Search Console / robots.txt
 * without us editing the upstream sitemap index file.
 */
export async function GET() {
  const site = resolveSiteUrl(process.env).replace(/\/$/, '')

  const [communities, markets] = await Promise.all([
    CommunityDiscoveryRepository.listAllForSitemap(),
    CommunityDiscoveryRepository.listMarketsForSitemap(),
  ])

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  const entries: string[] = []
  entries.push('<?xml version="1.0" encoding="UTF-8"?>')
  entries.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

  for (const c of communities) {
    entries.push('  <url>')
    entries.push(`    <loc>${escape(`${site}/community/${c.slug}`)}</loc>`)
    entries.push(`    <lastmod>${escape(c.updated_at)}</lastmod>`)
    entries.push(`    <changefreq>daily</changefreq>`)
    entries.push(`  </url>`)
  }
  for (const m of markets) {
    entries.push('  <url>')
    entries.push(`    <loc>${escape(`${site}/community/${m.community_slug}/market/${m.market_id}`)}</loc>`)
    entries.push(`    <lastmod>${escape(m.updated_at)}</lastmod>`)
    entries.push(`    <changefreq>weekly</changefreq>`)
    entries.push(`  </url>`)
  }

  entries.push('</urlset>')

  return new Response(entries.join('\n'), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=21600',
    },
  })
}
