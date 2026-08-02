'use client'

import { ActivityIcon, Check, Code2 as Code2Icon, Copy, Globe, Lock, MoreHorizontal, Paintbrush, Plus, Settings as SettingsIcon, Share2, Star } from 'lucide-react'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from '@/components/ui/toast'
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
      <section className="relative isolate overflow-hidden rounded-2xl border border-border/60 bg-background">
        {/* Banner background — spans the whole panel, content overlays it */}
        <div className="absolute inset-0">
          {community.banner_url
            ? (
                <img src={community.banner_url} alt="" className="size-full object-cover" />
              )
            : (
                <svg
                  className="absolute inset-0 size-full text-primary"
                  viewBox="0 0 1200 400"
                  preserveAspectRatio="xMidYMid slice"
                  aria-hidden
                >
                  <defs>
                    <radialGradient id="classic-hero-glow" cx="78%" cy="28%" r="55%">
                      <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#classic-hero-glow)" />
                  {/* Faint trace network biased to the right */}
                  <g stroke="currentColor" fill="none" strokeOpacity="0.25" strokeWidth="1.5">
                    <path d="M620 120 H820 V60 H1000" />
                    <path d="M700 200 H900 V150 H1120" />
                    <path d="M760 300 H980 V250 H1160" />
                    <path d="M640 60 H720 V20" />
                    <path d="M860 360 H1020 V320 H1200" />
                  </g>
                  {/* Bright accent trace */}
                  <g stroke="currentColor" fill="none" strokeOpacity="0.9" strokeWidth="2.5">
                    <path d="M560 160 H840 V90 H1080 V40 H1200" />
                  </g>
                  {/* Nodes */}
                  <g fill="currentColor">
                    <circle cx="820" cy="60" r="4" fillOpacity="0.5" />
                    <circle cx="900" cy="150" r="4" fillOpacity="0.5" />
                    <circle cx="980" cy="250" r="4" fillOpacity="0.5" />
                    <circle cx="840" cy="90" r="5" fillOpacity="0.95" />
                    <circle cx="1080" cy="40" r="5" fillOpacity="0.95" />
                  </g>
                </svg>
              )}
          {/* Darkening gradients so the left-aligned content stays legible */}
          <div className="absolute inset-0 bg-linear-to-r from-background via-background/85 to-background/30" />
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/30 to-transparent" />
        </div>

        {/* Top-right type chip */}
        <div className="absolute top-4 right-4 z-10">
          <span className="
            inline-flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1 text-2xs font-semibold
            tracking-wider text-foreground uppercase shadow-sm ring-1 ring-border/60 backdrop-blur-sm
          "
          >
            {community.type === 'private' ? <Lock className="size-3" /> : <Globe className="size-3" />}
            {community.type}
          </span>
        </div>

        {/* Content overlay */}
        <div className="
          relative z-10 flex flex-col gap-5 px-5 pt-24 pb-5
          sm:flex-row sm:items-end sm:justify-between sm:gap-6 sm:px-8 sm:pt-32 sm:pb-7
        "
        >
          {/* Avatar + identity */}
          <div className="flex items-end gap-4 sm:gap-5">
            <div className="
              relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-r-4
              border-primary bg-card text-3xl shadow-xl ring-1 ring-border/60
              sm:size-28 sm:text-4xl
            "
            >
              {community.icon_url
                ? <img src={community.icon_url} alt="" className="size-full object-cover" />
                : <span>🏛️</span>}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="flex items-center gap-1.5 text-2xl/tight font-bold tracking-tight sm:text-3xl">
                  <span>{community.name}</span>
                  <VerifiedBadge isVerified={community.is_verified} />
                </h1>
                {roleLabel && (
                  <span className={cn(
                    'rounded-md px-2 py-0.5 text-2xs font-bold tracking-wider uppercase',
                    roleLabel === 'Admin' && 'bg-primary text-primary-foreground',
                    roleLabel === 'Juror' && 'bg-amber-500/20 text-amber-500',
                    roleLabel === 'Member' && 'bg-muted text-muted-foreground',
                  )}
                  >
                    {roleLabel}
                  </span>
                )}
              </div>
              {community.description && (
                <p className="mt-2 max-w-2xl text-sm/relaxed text-muted-foreground">
                  {community.description}
                </p>
              )}

              {/* Stats row with vertical dividers */}
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 sm:gap-x-6">
                <Stat label="Members" value={`${formatCompact(community.member_count)}/${formatCompact(community.max_members)}`} />
                <StatDivider />
                <Stat label="Markets" value={formatCompact(community.market_count)} />
                <StatDivider />
                <Stat
                  label="Rating"
                  value={community.review_count > 0 ? rating.toFixed(1) : '—'}
                  valueClassName={community.review_count > 0 ? 'text-primary' : undefined}
                  icon={community.review_count > 0
                    ? (
                        <span className="flex">
                          {[1, 2, 3, 4, 5].map(i => (
                            <Star
                              key={i}
                              className={cn(
                                'size-3',
                                i <= Math.round(rating) ? 'fill-primary text-primary' : 'text-muted-foreground/40',
                              )}
                            />
                          ))}
                        </span>
                      )
                    : undefined}
                />
                <StatDivider />
                <Stat label={community.jury_size === 1 ? 'Juror' : 'Jurors'} value={formatCompact(community.jury_size)} />
              </div>
            </div>
          </div>

          {/* Action cluster — aligned to the bottom-right */}
          <div className="flex shrink-0 items-center gap-2 self-start sm:self-end">
            {isAdmin && (
              <>
                <Button size="sm" nativeButton={false} render={<Link href={`/community/${community.slug}/markets/new` as any} />}>
                    <Plus className="mr-1.5 size-3.5" />
                    Add Market
                  </Button>
                <Button variant="outline" size="sm" onClick={handleGenerateInvite}>
                  <Share2 className="mr-1.5 size-3.5" />
                  Invite
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More" />}>
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem render={<Link href={`/community/${community.slug}/settings` as any} />}>
                        <SettingsIcon className="size-3.5" />
                        Settings
                      </DropdownMenuItem>
                    <DropdownMenuItem render={<Link href={`/community/${community.slug}/theme` as any} />}>
                        <Paintbrush className="size-3.5" />
                        Theme & layout
                      </DropdownMenuItem>
                    <DropdownMenuItem render={<Link href={`/community/${community.slug}/insights` as any} />}>
                        <ActivityIcon className="size-3.5" />
                        Insights
                      </DropdownMenuItem>
                    <DropdownMenuItem render={<Link href={`/community/${community.slug}/embed-settings` as any} />}>
                        <Code2Icon className="size-3.5" />
                        Embed settings
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

function Stat({ label, value, icon, valueClassName }: { label: string, value: string, icon?: React.ReactNode, valueClassName?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-2xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <p className={cn('truncate text-base leading-none font-bold', valueClassName)}>{value}</p>
        {icon}
      </div>
    </div>
  )
}

function StatDivider() {
  return <span aria-hidden className="h-8 w-px shrink-0 bg-border/70" />
}
