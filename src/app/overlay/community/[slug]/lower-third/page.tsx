import OverlayView from '@/app/overlay/community/[slug]/_components/OverlayView'

/**
 * OBS browser source: `/overlay/community/<slug>/lower-third` shows the
 * newest open market's odds and rotates through them; `?market=<id>` pins
 * one. Add it as a 1920×1080 browser source with a transparent background.
 */
export function generateStaticParams() {
  return [{ slug: '__placeholder__' }]
}

export default async function LowerThirdPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ market?: string; rotate?: string }>
}) {
  const { slug } = await params
  const { market, rotate } = await searchParams
  const rotateSeconds = rotate ? Math.max(5, Math.min(120, Number(rotate) || 20)) : 20
  return <OverlayView slug={slug} variant="lower-third" marketId={market} rotateSeconds={rotateSeconds} />
}
