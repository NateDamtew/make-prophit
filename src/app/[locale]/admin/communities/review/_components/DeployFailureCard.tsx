'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { RotateCcw, AlertCircle, Loader2, ExternalLink } from 'lucide-react'
import { retryDeployAction } from '@/app/[locale]/(platform)/community/[slug]/_actions/review-actions'
import { Button } from '@/components/ui/button'

interface Market {
  id: string
  title: string
  review_status: string | null
  last_deploy_error: string | null
  deploy_attempts: number
  community_slug: string
  community_name: string
}

export default function DeployFailureCard({ market }: { market: Market }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleRetry() {
    startTransition(async () => {
      const result = await retryDeployAction(market.id, market.community_slug)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success('Deployment re-queued')
      router.refresh()
    })
  }

  return (
    <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/community/${market.community_slug}` as any}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {market.community_name}
              <ExternalLink className="ml-1 inline-block size-3" />
            </Link>
            <span className="rounded-full bg-destructive/20 px-1.5 py-0.5 text-[10px] font-medium uppercase text-destructive">
              {market.review_status === 'deploy_blocked' ? 'Blocked' : 'Failed'}
            </span>
          </div>
          <p className="mt-1 font-semibold">{market.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Attempts: {market.deploy_attempts}
          </p>

          {market.last_deploy_error && (
            <div className="mt-3 rounded-xl border border-destructive/30 bg-background p-3 font-mono text-xs">
              {market.last_deploy_error}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-destructive/20 pt-3">
        <Button size="sm" onClick={handleRetry} disabled={isPending}>
          {isPending
            ? <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            : <RotateCcw className="mr-1.5 size-3.5" />}
          Retry Deployment
        </Button>
      </div>
    </div>
  )
}
