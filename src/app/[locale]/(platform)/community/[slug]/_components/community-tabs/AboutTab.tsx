'use client'

import type { CommunitySummary } from './types'

interface AboutTabProps {
  community: CommunitySummary
}

export function AboutTab({ community }: AboutTabProps) {
  return (
    <div className="space-y-6 text-sm">
      {community.description && (
        <div>
          <p className="mb-2 font-semibold">About</p>
          <p className="text-muted-foreground">{community.description}</p>
        </div>
      )}
      {community.rules && (
        <div>
          <p className="mb-2 font-semibold">Community Rules</p>
          <div className="rounded-xl bg-muted/30 p-4 whitespace-pre-wrap text-muted-foreground">
            {community.rules}
          </div>
        </div>
      )}
      {community.terms && (
        <div>
          <p className="mb-2 font-semibold">Terms & Conditions</p>
          <div className="rounded-xl bg-muted/30 p-4 whitespace-pre-wrap text-muted-foreground">
            {community.terms}
          </div>
        </div>
      )}
      <div>
        <p className="mb-2 font-semibold">Governance</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border p-3 text-center">
            <p className="text-2xl font-bold">{community.jury_size}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Jury Size</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <p className="text-2xl font-bold">{community.max_members}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Max Members</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <p className="text-lg font-bold">
              {community.jury_size <= 2 ? '100%' : '>75%'}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Consensus</p>
          </div>
          <div className="rounded-xl border p-3 text-center">
            <p className="text-lg font-bold capitalize">{community.type}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Access</p>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Community created
        {' '}
        {new Date(community.created_at).toLocaleDateString()}
      </p>
    </div>
  )
}
