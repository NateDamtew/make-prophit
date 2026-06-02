'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Users, Star, TrendingUp, Lock, Globe, Share2, Copy, Check, Plus, Scale } from 'lucide-react'
import { joinCommunityAction, leaveCommunityAction, generateInviteAction } from '../_actions/community-actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface Community {
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
}

interface Props {
  community: Community
  memberRole: string | null
  currentUserId: string | null
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          className={cn(
            'size-3.5',
            star <= Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground/30',
          )}
        />
      ))}
    </div>
  )
}

export default function CommunityHeader({ community, memberRole, currentUserId }: Props) {
  const [isPending, startTransition] = useTransition()
  const [showInviteDialog, setShowInviteDialog] = useState(false)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isMember = !!memberRole
  const isAdmin = memberRole === 'admin'
  const rating = Number(community.average_rating ?? 0)

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
      else {
        toast.success(`Welcome to ${community.name}!`)
      }
    })
  }

  function handleLeave() {
    startTransition(async () => {
      const result = await leaveCommunityAction(community.id, community.slug)
      if (result.error) {
        toast.error(result.error)
      }
      else {
        toast.success('You have left the community.')
      }
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
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      {/* Banner — richer gradient with subtle pattern */}
      <div className="relative h-44 overflow-hidden rounded-3xl sm:h-56">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-primary/15 to-background" />
        {/* Subtle radial accent */}
        <div className="absolute -left-20 -top-20 size-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -right-32 -bottom-20 size-72 rounded-full bg-amber-500/10 blur-3xl" />
        {community.banner_url && (
          <img
            src={community.banner_url}
            alt=""
            className="relative size-full object-cover"
          />
        )}
        {/* Top-right type pill */}
        <div className="absolute right-4 top-4">
          <span className="flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs font-medium uppercase tracking-wide text-foreground shadow-sm backdrop-blur-sm">
            {community.type === 'private'
              ? <Lock className="size-3" />
              : <Globe className="size-3" />}
            {community.type}
          </span>
        </div>
      </div>

      {/* Main info card — overlapping banner */}
      <div className="relative -mt-10 mx-2 rounded-2xl border bg-card p-5 shadow-sm sm:mx-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            {/* Icon — bigger, ring shadow */}
            <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 text-3xl shadow-lg ring-4 ring-background sm:size-24 sm:text-4xl">
              {community.icon_url
                ? <img src={community.icon_url} alt="" className="size-full rounded-xl object-cover" />
                : '🏛️'}
            </div>
            <div className="min-w-0 flex-1 pt-1 sm:pt-2">
              <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                {community.name}
              </h1>
              {community.description && (
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {community.description}
                </p>
              )}
              {/* Role badge inline */}
              {memberRole && (
                <div className="mt-2">
                  <span className={cn(
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                    memberRole === 'admin' && 'bg-primary/15 text-primary',
                    memberRole === 'juror' && 'bg-amber-500/15 text-amber-600',
                    memberRole === 'member' && 'bg-muted text-muted-foreground',
                  )}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    {memberRole === 'admin' ? 'Admin' : memberRole === 'juror' ? 'Juror' : 'Member'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2">
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={handleGenerateInvite}>
                  <Share2 className="mr-1.5 size-3.5" />
                  Invite
                </Button>
                <Button size="sm" asChild>
                  <Link href={`/community/${community.slug}/markets/new` as any}>
                    <Plus className="mr-1.5 size-3.5" />
                    Add Market
                  </Link>
                </Button>
              </>
            )}
            {!isAdmin && !isMember && community.type === 'public' && (
              <Button size="sm" onClick={handleJoin} disabled={isPending}>
                {isPending ? 'Joining...' : 'Join Community'}
              </Button>
            )}
            {isMember && !isAdmin && (
              <Button variant="outline" size="sm" onClick={handleLeave} disabled={isPending}>
                {isPending ? 'Leaving...' : 'Leave'}
              </Button>
            )}
          </div>
        </div>

        {/* Stats — visual pills */}
        <div className="mt-5 grid grid-cols-2 gap-3 border-t pt-4 sm:grid-cols-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <Users className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-bold leading-none">
                {community.member_count}
                <span className="text-xs font-normal text-muted-foreground">
                  {' '}/ {community.max_members}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground">Members</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-green-500/10 text-green-600">
              <TrendingUp className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold leading-none">{community.market_count}</p>
              <p className="text-[11px] text-muted-foreground">Markets</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <Star className="size-4 fill-current" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold leading-none">
                {community.review_count > 0 ? rating.toFixed(1) : '—'}
                {community.review_count > 0 && (
                  <span className="text-xs font-normal text-muted-foreground">
                    {' '}({community.review_count})
                  </span>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground">Rating</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
              <Scale className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold leading-none">{community.jury_size}</p>
              <p className="text-[11px] text-muted-foreground">
                {community.jury_size === 1 ? 'Juror' : 'Jurors'}
              </p>
            </div>
          </div>
        </div>
      </div>


      {/* Invite dialog */}
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
