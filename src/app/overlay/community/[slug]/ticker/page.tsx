import { notFound } from 'next/navigation'

import OverlayView from '@/app/overlay/community/[slug]/_components/OverlayView'

/**
 * OBS browser source: `/overlay/community/<slug>/ticker` scrolls every open
 * market with its odds along the bottom edge of the scene.
 */
export function generateStaticParams() {
  return [{ slug: '__placeholder__' }]
}

export default async function TickerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (slug === '__placeholder__') {
    notFound()
  }
  return <OverlayView slug={slug} variant="ticker" />
}
