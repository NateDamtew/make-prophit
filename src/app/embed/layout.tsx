/**
 * Isolated layout for the public embed routes. We intentionally do NOT extend
 * the platform's [locale]/layout.tsx — no i18n, no AppKit, no providers, no
 * stylesheet imports beyond the per-route embed.css. This keeps each embed
 * iframe small, deterministic, and decoupled from platform changes that would
 * otherwise leak into a publisher's page.
 *
 * Iframe security
 * ---------------
 * Phase 2 v1 ships with `frame-ancestors *` so a community admin can embed
 * anywhere immediately. Tightening per `community_embed_configs.allowed_domains`
 * is wired through middleware in a follow-up — the data model is already in
 * place (see {@link CommunityEmbedRepository}).
 */
import type { ReactNode } from 'react'

export const metadata = {
  // Search engines should never index the embed iframe.
  robots: { index: false, follow: false },
}

export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="referrer" content="no-referrer-when-downgrade" />
      </head>
      <body>{children}</body>
    </html>
  )
}
