import Link from 'next/link'
import TmaBottomNav from '../_components/TmaBottomNav'
import TmaHeader from '../_components/TmaHeader'

export default function TmaPortfolioPage() {
  return (
    <main className="flex flex-col pb-20">
      <TmaHeader title="Portfolio" />
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Connect your wallet to view your positions.
        </p>
        <Link
          href={'/en/portfolio' as any}
          className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Open Full App
        </Link>
      </div>
      <TmaBottomNav />
    </main>
  )
}
