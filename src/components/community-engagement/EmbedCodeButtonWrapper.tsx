import resolveSiteUrl from '@/lib/site-url'
import { EmbedCodeButton } from './EmbedCodeButton'

/**
 * Server-side wrapper that resolves the public site origin once on the server
 * and hands it to the client EmbedCodeButton. Keeps the iframe src absolute
 * regardless of where the page renders (preview, prod, local).
 */
export function CommunityMarketEmbedButton({ communitySlug, marketId }: {
  communitySlug: string
  marketId: string
}) {
  const siteUrl = resolveSiteUrl(process.env)
  return (
    <EmbedCodeButton
      communitySlug={communitySlug}
      marketId={marketId}
      siteOrigin={siteUrl}
    />
  )
}
