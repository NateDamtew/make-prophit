'use client'

import {
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronLeft,
  Clock,
  ExternalLink,
  FileText,
  Gavel,
  Sparkles,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CommentsSection } from '@/components/community-engagement/CommentsSection'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { castJuryVoteAction } from '../../../_actions/community-actions'
import CommunityVoteChart from './CommunityVoteChart'

interface Market {
  id: string
  title: string
  description: string | null
  resolution_source: string | null
  resolution_rules: string | null
  resolution_date: Date | null
  status: string
  resolved_outcome: string | null
  resolved_at: Date | null
  event_id: string | null
  created_at: Date
}

interface Community {
  id: string
  slug: string
  name: string
  icon_url: string | null
  jury_size: number
  type: string
}

interface Vote {
  id: string
  vote: string
  reasoning: string
  evidence_url: string | null
  voted_at: Date
  juror_username: string | null
  juror_image: string | null
}

interface Props {
  market: Market
  community: Community
  votes: Vote[]
  memberRole: string | null
  currentUserId: string | null
}

export default function CommunityMarketDetail({
  market,
  community,
  votes,
  memberRole,
  currentUserId,
}: Props) {
  const [voteChoice, setVoteChoice] = useState<'yes' | 'no' | 'disputed' | null>(null)
  const [reasoning, setReasoning] = useState('')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [isSubmitting, startTransition] = useTransition()

  const isJuror = memberRole === 'juror' || memberRole === 'admin'
  const isResolved = market.status === 'resolved'

  const tally = useMemo(() => {
    const yes = votes.filter(v => v.vote === 'yes').length
    const no = votes.filter(v => v.vote === 'no').length
    const disputed = votes.filter(v => v.vote === 'disputed').length
    const total = yes + no
    const yesPct = total > 0 ? (yes / total) * 100 : 50
    return { yes, no, disputed, total: yes + no + disputed, yesPct, noPct: 100 - yesPct }
  }, [votes])

  const myVote = useMemo(
    () => currentUserId ? votes.find(v => (v as any).juror_id === currentUserId) : undefined,
    [votes, currentUserId],
  )

  const roundedYes = Math.round(tally.yesPct)

  function handleSubmit() {
    if (!voteChoice) {
      toast.error('Please select a vote.')
      return
    }
    if (reasoning.trim().length < 10) {
      toast.error('Please provide at least 10 characters of reasoning.')
      return
    }
    startTransition(async () => {
      const result = await castJuryVoteAction(
        market.id,
        community.id,
        community.slug,
        {
          vote: voteChoice,
          reasoning: reasoning.trim(),
          evidence_url: evidenceUrl.trim() || undefined,
        },
      )
      if (result.error) {
        toast.error(result.error)
      }
      else {
        toast.success('Vote cast!')
        setReasoning('')
        setEvidenceUrl('')
      }
    })
  }

  return (
    <main className="container py-6">
      <div className="mx-auto grid max-w-6xl gap-6">
        {/* Back link */}
        <Link
          href={`/community/${community.slug}` as any}
          className="
            inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors
            hover:text-foreground
          "
        >
          <ChevronLeft className="size-4" />
          Back to
          {' '}
          {community.name}
        </Link>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Main column */}
          <div className="space-y-4">
            {/* Header card */}
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-2 text-xs">
                  <Link
                    href={`/community/${community.slug}` as any}
                    className="
                      flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium
                      hover:bg-muted/80
                    "
                  >
                    {community.icon_url
                      ? <img src={community.icon_url} alt="" className="size-4 rounded-sm object-cover" />
                      : <span>🏛️</span>}
                    {community.name}
                  </Link>
                  {community.type === 'private' && (
                    <span className="
                      rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-medium tracking-wide text-amber-600
                      uppercase
                    "
                    >
                      Private
                    </span>
                  )}
                  {isResolved
                    ? (
                        <span className={cn(
                          `
                            flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium tracking-wide
                            uppercase
                          `,
                          market.resolved_outcome === 'yes'
                            ? 'bg-yes/15 text-yes-foreground'
                            : `bg-no/15 text-no-foreground`,
                        )}
                        >
                          <CheckCircle className="size-3" />
                          Resolved
                          {' '}
                          {market.resolved_outcome?.toUpperCase()}
                        </span>
                      )
                    : (
                        <span className="
                          flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium
                          tracking-wide text-primary uppercase
                        "
                        >
                          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                          Live
                        </span>
                      )}
                </div>

                <h1 className="text-xl/snug font-bold sm:text-2xl">{market.title}</h1>

                {market.description && (
                  <p className="text-sm text-muted-foreground">{market.description}</p>
                )}

                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  {market.resolution_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3.5" />
                      Resolves
                      {' '}
                      {new Date(market.resolution_date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Gavel className="size-3.5" />
                    {tally.total}
                    /
                    {community.jury_size}
                    {' '}
                    jury votes
                  </span>
                  {market.event_id && (
                    <Link
                      href={`/event/${market.event_id}` as any}
                      className="flex items-center gap-1 font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="size-3.5" />
                      Trade on platform
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Chart card */}
            <Card>
              <CardContent className="p-5">
                <div className="mb-4 flex items-end justify-between">
                  <div>
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Current Sentiment
                    </p>
                    <p className="mt-1 text-4xl font-bold tabular-nums">
                      {roundedYes}
                      <span className="text-lg font-medium text-muted-foreground">% Yes</span>
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>
                      Based on
                      {tally.total}
                      {' '}
                      {tally.total === 1 ? 'vote' : 'votes'}
                    </p>
                    {market.resolution_date && (
                      <p className="mt-0.5 flex items-center justify-end gap-1">
                        <Clock className="size-3" />
                        {(() => {
                          const days = Math.ceil(
                            (new Date(market.resolution_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
                          )
                          if (days < 0) {
                            return 'Past resolution date'
                          }
                          if (days === 0) {
                            return 'Resolves today'
                          }
                          return `${days} ${days === 1 ? 'day' : 'days'} left`
                        })()}
                      </p>
                    )}
                  </div>
                </div>

                <CommunityVoteChart votes={votes} resolutionDate={market.resolution_date} />

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-yes/10 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-yes-foreground">YES</span>
                      <span className="text-lg font-bold text-yes-foreground tabular-nums">
                        {roundedYes}
                        %
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tally.yes}
                      {' '}
                      {tally.yes === 1 ? 'vote' : 'votes'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-no/10 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-no-foreground">NO</span>
                      <span className="text-lg font-bold text-no-foreground tabular-nums">
                        {Math.round(tally.noPct)}
                        %
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tally.no}
                      {' '}
                      {tally.no === 1 ? 'vote' : 'votes'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Resolution rules */}
            {(market.resolution_rules || market.resolution_source) && (
              <Card>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                      Resolution
                    </h2>
                  </div>
                  {market.resolution_source && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Source</p>
                      <p className="mt-0.5 text-sm">{market.resolution_source}</p>
                    </div>
                  )}
                  {market.resolution_rules && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Rules</p>
                      <p className="mt-0.5 text-sm whitespace-pre-wrap text-muted-foreground">
                        {market.resolution_rules}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Jury votes list */}
            <Card>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <Gavel className="size-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    Jury Votes
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    (
                    {votes.length}
                    /
                    {community.jury_size}
                    )
                  </span>
                </div>

                {votes.length === 0
                  ? (
                      <div className="py-8 text-center">
                        <Gavel className="mx-auto mb-2 size-8 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No votes cast yet</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {isJuror ? 'Be the first to cast your vote.' : 'Jury members will vote near resolution time.'}
                        </p>
                      </div>
                    )
                  : (
                      <ul className="space-y-3">
                        {votes.map(v => (
                          <li key={v.id} className="rounded-xl border bg-background p-3">
                            <div className="flex items-start gap-3">
                              <div className="
                                flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm
                                font-medium
                              "
                              >
                                {v.juror_image
                                  ? <img src={v.juror_image} alt="" className="size-9 rounded-full object-cover" />
                                  : (v.juror_username?.[0] ?? '?').toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">
                                    {v.juror_username ? `@${v.juror_username}` : 'Anonymous'}
                                  </span>
                                  {v.vote === 'yes' && (
                                    <span className="
                                      flex items-center gap-1 rounded-full bg-yes/15 px-1.5 py-0.5 text-2xs font-medium
                                      text-yes-foreground
                                    "
                                    >
                                      <CheckCircle className="size-2.5" />
                                      YES
                                    </span>
                                  )}
                                  {v.vote === 'no' && (
                                    <span className="
                                      flex items-center gap-1 rounded-full bg-no/15 px-1.5 py-0.5 text-2xs font-medium
                                      text-no-foreground
                                    "
                                    >
                                      <XCircle className="size-2.5" />
                                      NO
                                    </span>
                                  )}
                                  {v.vote === 'disputed' && (
                                    <span className="
                                      flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-2xs
                                      font-medium text-amber-600
                                    "
                                    >
                                      <AlertCircle className="size-2.5" />
                                      DISPUTED
                                    </span>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(v.voted_at).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">{v.reasoning}</p>
                                {v.evidence_url && (
                                  <a
                                    href={v.evidence_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                  >
                                    <ExternalLink className="size-3" />
                                    Evidence
                                  </a>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar: Voting panel */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardContent className="space-y-4 p-5">
                {isResolved
                  ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="size-5 text-primary" />
                          <h3 className="font-semibold">Market Resolved</h3>
                        </div>
                        <div className={cn(
                          'flex flex-col items-center rounded-xl p-6',
                          market.resolved_outcome === 'yes' ? 'bg-yes/10' : 'bg-no/10',
                        )}
                        >
                          {market.resolved_outcome === 'yes'
                            ? <CheckCircle className="size-10 text-yes-foreground" />
                            : <XCircle className="size-10 text-no-foreground" />}
                          <p className={cn(
                            'mt-2 text-2xl font-bold',
                            market.resolved_outcome === 'yes' ? 'text-yes-foreground' : 'text-no-foreground',
                          )}
                          >
                            {market.resolved_outcome?.toUpperCase()}
                          </p>
                          {market.resolved_at && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {new Date(market.resolved_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  : isJuror
                    ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Gavel className="size-5 text-primary" />
                            <h3 className="font-semibold">Cast Your Vote</h3>
                          </div>
                          {myVote && (
                            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
                              <p className="font-medium text-primary">
                                You already voted:
                                {(myVote as any).vote?.toUpperCase()}
                              </p>
                              <p className="mt-1 text-muted-foreground">Submitting again will replace your vote.</p>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              variant={voteChoice === 'yes' ? 'yes' : 'outline'}
                              size="outcome"
                              onClick={() => setVoteChoice('yes')}
                            >
                              Yes
                            </Button>
                            <Button
                              variant={voteChoice === 'no' ? 'no' : 'outline'}
                              size="outcome"
                              onClick={() => setVoteChoice('no')}
                            >
                              No
                            </Button>
                          </div>

                          <button
                            type="button"
                            onClick={() => setVoteChoice('disputed')}
                            className={cn(
                              `
                                flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs
                                font-medium transition-colors
                              `,
                              voteChoice === 'disputed'
                                ? 'border-amber-500/40 bg-amber-500/10 text-amber-600'
                                : 'hover:bg-muted/30',
                            )}
                          >
                            <AlertCircle className="size-3.5" />
                            Mark as Disputed
                          </button>

                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">Reasoning *</label>
                            <textarea
                              value={reasoning}
                              onChange={e => setReasoning(e.target.value)}
                              placeholder="Explain your vote based on the resolution source..."
                              className="
                                w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none
                                placeholder:text-muted-foreground
                                focus:ring-1 focus:ring-primary
                              "
                              rows={4}
                              maxLength={1000}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-medium">
                              Evidence URL
                              <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
                            </label>
                            <input
                              type="url"
                              value={evidenceUrl}
                              onChange={e => setEvidenceUrl(e.target.value)}
                              placeholder="https://..."
                              className="
                                w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none
                                placeholder:text-muted-foreground
                                focus:ring-1 focus:ring-primary
                              "
                            />
                          </div>

                          <Button
                            onClick={handleSubmit}
                            disabled={!voteChoice || isSubmitting}
                            className="w-full"
                          >
                            {isSubmitting ? 'Submitting...' : myVote ? 'Update Vote' : 'Submit Vote'}
                          </Button>

                          <p className="text-center text-2xs text-muted-foreground">
                            All votes are public and binding once resolved.
                          </p>
                        </>
                      )
                    : (
                        <div className="space-y-3 text-center">
                          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                            <Gavel className="size-6 text-muted-foreground" />
                          </div>
                          <div>
                            <h3 className="font-semibold">Jury Only</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Only appointed jurors can vote on this market's outcome.
                            </p>
                          </div>
                          {!memberRole && community.type === 'public' && (
                            <p className="text-xs text-muted-foreground">
                              Join the community to participate in discussions.
                            </p>
                          )}
                        </div>
                      )}
              </CardContent>
            </Card>

            {/* Consensus info card */}
            <Card className="mt-4">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">How Resolution Works</h3>
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>
                    This market is governed by
                    {' '}
                    <strong className="text-foreground">{community.jury_size}</strong>
                    {' '}
                    {community.jury_size === 1 ? 'juror' : 'jurors'}
                    .
                  </p>
                  <p>
                    Consensus required:
                    {' '}
                    <strong className="text-foreground">
                      {community.jury_size <= 2
                        ? 'Unanimous'
                        : `${Math.ceil(community.jury_size * 0.75)} of ${community.jury_size} (>75%)`}
                    </strong>
                  </p>
                  <p>
                    All votes are public and include reasoning. Once consensus is reached,
                    the market settles automatically.
                  </p>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>

        <section className="mt-8">
          <CommentsSection
            marketId={market.id}
            currentUserId={currentUserId}
            memberRole={memberRole}
            joinHref={`/community/${community.slug}`}
          />
        </section>
      </div>
    </main>
  )
}
