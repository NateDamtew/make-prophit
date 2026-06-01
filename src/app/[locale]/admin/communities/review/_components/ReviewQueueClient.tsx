'use client'

import { useState } from 'react'
import { Inbox, AlertCircle } from 'lucide-react'
import ReviewMarketCard from './ReviewMarketCard'
import DeployFailureCard from './DeployFailureCard'
import { cn } from '@/lib/utils'

interface PendingMarket {
  id: string
  title: string
  description: string | null
  resolution_source: string | null
  resolution_rules: string | null
  resolution_date: Date | null
  main_category_slug: string | null
  category_slugs: string[] | null
  submitted_at: Date | null
  created_at: Date
  community_slug: string
  community_name: string
  community_icon: string | null
  creator_username: string | null
}

interface FailureMarket {
  id: string
  title: string
  review_status: string | null
  last_deploy_error: string | null
  deploy_attempts: number
  community_slug: string
  community_name: string
}

type Tab = 'pending' | 'failures'

interface Props {
  pendingMarkets: PendingMarket[]
  failureMarkets: FailureMarket[]
}

export default function ReviewQueueClient({ pendingMarkets, failureMarkets }: Props) {
  const [tab, setTab] = useState<Tab>('pending')

  return (
    <div className="overflow-hidden rounded-2xl border">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b px-4 pt-3">
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={cn(
            'flex items-center gap-2 px-3 pb-3 text-sm font-medium transition-colors',
            tab === 'pending'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Inbox className="size-4" />
          Pending ({pendingMarkets.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('failures')}
          className={cn(
            'flex items-center gap-2 px-3 pb-3 text-sm font-medium transition-colors',
            tab === 'failures'
              ? 'border-b-2 border-destructive text-destructive'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <AlertCircle className="size-4" />
          Deploy Issues ({failureMarkets.length})
        </button>
      </div>

      {/* Content */}
      <div className="space-y-3 p-4">
        {tab === 'pending'
          ? (
              pendingMarkets.length === 0
                ? (
                    <div className="py-12 text-center">
                      <Inbox className="mx-auto mb-3 size-10 text-muted-foreground/30" />
                      <p className="font-medium">All caught up</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        No markets waiting for review.
                      </p>
                    </div>
                  )
                : (
                    pendingMarkets.map(m => <ReviewMarketCard key={m.id} market={m} />)
                  )
            )
          : (
              failureMarkets.length === 0
                ? (
                    <div className="py-12 text-center">
                      <AlertCircle className="mx-auto mb-3 size-10 text-muted-foreground/30" />
                      <p className="font-medium">No deployment issues</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        All approved markets deployed successfully.
                      </p>
                    </div>
                  )
                : (
                    failureMarkets.map(m => <DeployFailureCard key={m.id} market={m} />)
                  )
            )}
      </div>
    </div>
  )
}
