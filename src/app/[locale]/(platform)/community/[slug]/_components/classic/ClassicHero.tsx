'use client'

import { ActivityIcon, Check, Code2 as Code2Icon, Copy, Globe, Lock, MoreHorizontal, Paintbrush, Plus, Share2, Star } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { VerifiedBadge } from '@/components/community-engagement/VerifiedBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { generateInviteAction, joinCommunityAction, leaveCommunityAction } from '../../_actions/community-actions'

interface ClassicHeroCommunity {
  id: string
  slug: string
  name: string
  description: string | null
  banner_url: string | null
  icon_url: string | null
  type: string
  jury_size: number
  max_members: number
  member_count: number
  market_count: number
  average_rating: string | null
  review_count: number
  is_verified?: boolean | null
}

interface Props {
  community: ClassicHeroCommunity
  memberRole: string | null
  currentUserId: string | null
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`
  }
  return String(n)
}

export default function ClassicHero({ community, memberRole, currentUserId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isMember = !!memberRole
  const isAdmin = memberRole === 'admin'
  const rating = Number(community.average_rating ?? 0)
  const roleLabel = memberRole === 'admin' ? 'Admin' : memberRole === 'juror' ? 'Juror' : memberRole === 'member' ? 'Member' : null

  function handleJoin() {
    if (!currentUserId) {
      toast.error('Please sign in to join this community.')
      return
    }
    startTransition(async () => {
      const result = await joinCommunityAction(community.id)
      if (result.error) {
        toast.error(result.error)
      }
      else { toast.success(`Welcome to ${community.name}!`) }
    })
  }

  function handleLeave() {
    startTransition(async () => {
      const result = await leaveCommunityAction(community.id, community.slug)
      if (result.error) {
        toast.error(result.error)
      }
      else { toast.success('You have left the community.') }
    })
  }

  async function handleGenerateInvite() {
    const result = await generateInviteAction(community.id)
    if (result.error) {
      toast.error(result.error)
      return
    }
    setInviteCode(result.data?.code ?? null)
    setShowInviteDialog(true)
  }

  async function copyInviteLink() {
    if (!inviteCode) {
      return
    }
    const link = `${window.location.origin}/community/${community.slug}?invite=${inviteCode}`
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(setCopied, 2000, false)
  }

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl border bg-card">
        {/* Banner */}
        <div className="relative h-44 overflow-hidden sm:h-56">
          {community.banner_url
            ? (
                <img src={community.banner_url} alt="" className="size-full object-cover" />
              )
            : (
                <div className="absolute inset-0 bg-linear-to-br from-primary/25 via-primary/10 to-background">
                  {/* Subtle circuit-style pattern using SVG so it inherits the accent */}
                  <svg
                    className="absolute inset-0 size-full text-primary/15"
                    viewBox="0 0 400 200"
                    preserveAspectRatio="xMaxYMid slice"
                    aria-hidden
                  >
                    <defs>
                      <pattern id="classic-hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M40 0H0V40" fill="none" stroke="currentColor" strokeWidth="0.5" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#classic-hero-grid)" />
                    <g stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.7">
                      <path d="M180 40 L260 40 L260 90 L320 90" />
                      <path d="M220 130 L300 130 L300 170 L380 170" />
                      <circle cx="260" cy="40" r="3" fill="currentColor" />
                      <circle cx="320" cy="90" r="3" fill="currentColor" />
                      <circle cx="300" cy="130" r="3" fill="currentColor" />
                    </g>
                  </svg>
                </div>
              )}
          {/* Top-right type chip */}
          <div className="absolute top-4 right-4">
            <span className="
              inline-flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-2xs font-semibold
              tracking-wider text-foreground uppercase shadow-sm backdrop-blur-sm
            "
            >
              {community.type === 'private' ? <Lock className="size-3" /> : <Globe className="size-3" />}
              {community.type}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 pt-0 pb-5 sm:px-7 sm:pb-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            {/* Avatar + identity */}
            <div className="flex items-start gap-4">
              <div className="
                relative -mt-12 flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-l-4
                border-primary bg-card text-3xl shadow-lg ring-4 ring-background
                sm:-mt-14 sm:size-28 sm:text-4xl
              "
              >
                {community.icon_url
                  ? <img src={community.icon_url} alt="" className="size-full object-cover" />
                  : <span>🏛️</span>}
              </div>
              <div className="min-w-0 flex-1 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="flex items-center gap-1.5 text-2xl/tight font-bold tracking-tight sm:text-3xl">
                    <span>{community.name}</span>
                    <VerifiedBadge isVerified={community.is_verified} />
                  </h1>
                  {roleLabel && (
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-2xs font-semibold tracking-wider uppercase',
                      roleLabel === 'Admin' && 'bg-primary/15 text-primary',
                      roleLabel === 'Juror' && 'bg-amber-500/15 text-amber-600',
                      roleLabel === 'Member' && 'bg-muted text-muted-foreground',
                    )}
                    >
                      {roleLabel}
                    </span>
                  )}
                </div>
                {community.description && (
                  <p className="mt-1.5 max-w-2xl text-sm/relaxed text-muted-foreground">
                    {community.description}
                  </p>
                )}
              </div>
            </div>

            {/* Action cluster */}
            <div className="flex shrink-0 items-center gap-2">
              {isAdmin && (
                <>
                  <Button size="sm" asChild>
                    <Link href={`/community/${community.slug}/markets/new` as any}>
                      <Plus className="mr-1.5 size-3.5" />
                      Add Market
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleGenerateInvite}>
                    <Share2 className="mr-1.5 size-3.5" />
                    Invite
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" aria-label="More">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem asChild>
                        <Link href={`/community/${community.slug}/theme` as any}>
                          <Paintbrush className="size-3.5" />
                          Theme & layout
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/community/${community.slug}/insights` as any}>
                          <ActivityIcon className="size-3.5" />
                          Insights
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/community/${community.slug}/embed-settings` as any}>
                          <Code2Icon className="size-3.5" />
                          Embed settings
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
              {!isAdmin && !isMember && community.type === 'public' && (
                <Button size="sm" onClick={handleJoin} disabled={isPending}>
                  {isPending ? 'Joining…' : 'Join Community'}
                </Button>
              )}
              {isMember && !isAdmin && (
                <Button variant="outline" size="sm" onClick={handleLeave} disabled={isPending}>
                  {isPending ? 'Leaving…' : 'Leave'}
                </Button>
              )}
            </div>
          </div>

          {/* Stats strip */}
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-5 sm:grid-cols-4">
            <Stat label="Members" value={`${formatCompact(community.member_count)}/${formatCompact(community.max_members)}`} />
            <Stat label="Markets" value={formatCompact(community.market_count)} />
            <Stat
              label="Rating"
              value={community.review_count > 0 ? rating.toFixed(1) : '—'}
              icon={(
                <span className="flex">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star
                      key={i}
                      className={cn(
                        'size-3',
                        community.review_count > 0 && i <= Math.round(rating)
                          ? 'fill-primary text-primary'
                          : 'text-muted-foreground/40',
                      )}
                    />
                  ))}
                </span>
              )}
            />
            <Stat label={community.jury_size === 1 ? 'Juror' : 'Jurors'} value={formatCompact(community.jury_size)} />
          </div>
        </div>
      </section>

      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Link</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Share this link to invite people to your community. Expires in 7 days.
          </p>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <span className="flex-1 truncate font-mono text-xs">
              {typeof window !== 'undefined'
                ? `${window.location.origin}/community/${community.slug}?invite=${inviteCode}`
                : `prophit.com/community/${community.slug}?invite=${inviteCode}`}
            </span>
            <Button variant="ghost" size="sm" onClick={copyInviteLink} className="shrink-0">
              {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Stat({ label, value, icon }: { label: string, value: string, icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="truncate text-lg leading-none font-bold">{value}</p>
        {icon}
      </div>
    </div>
  )
}
