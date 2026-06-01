'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Users, Star, TrendingUp, Lock, Globe, Share2, Copy, Check, Plus } from 'lucide-react'
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
      {/* Banner */}
      <div className="relative h-36 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-background sm:h-48">
        {community.banner_url && (
          <img
            src={community.banner_url}
            alt=""
            className="size-full object-cover"
          />
        )}
      </div>

      {/* Info row */}
      <div className="-mt-6 flex items-end justify-between gap-4 px-1">
        <div className="flex items-end gap-4">
          {/* Icon */}
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl border-4 border-background bg-muted text-2xl shadow-sm">
            {community.icon_url
              ? <img src={community.icon_url} alt="" className="size-full rounded-xl object-cover" />
              : '🏛️'}
          </div>
          <div className="pb-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{community.name}</h1>
              {community.type === 'private'
                ? <Lock className="size-4 text-muted-foreground" />
                : <Globe className="size-4 text-muted-foreground" />}
            </div>
            {community.description && (
              <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                {community.description}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2 pb-1">
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
              {isPending ? 'Joining...' : 'Join'}
            </Button>
          )}
          {isMember && !isAdmin && (
            <Button variant="outline" size="sm" onClick={handleLeave} disabled={isPending}>
              {isPending ? 'Leaving...' : 'Leave'}
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users className="size-3.5" />
          <strong className="text-foreground">{community.member_count}</strong>
          {' '}
          /
          {' '}
          {community.max_members}
          {' '}
          members
        </span>
        <span className="flex items-center gap-1.5">
          <TrendingUp className="size-3.5" />
          <strong className="text-foreground">{community.market_count}</strong>
          {' '}
          markets
        </span>
        {community.review_count > 0 && (
          <span className="flex items-center gap-1.5">
            <StarRating rating={rating} />
            <strong className="text-foreground">{rating.toFixed(1)}</strong>
            <span>({community.review_count} reviews)</span>
          </span>
        )}
        <span>
          Jury:
          {' '}
          <strong className="text-foreground">{community.jury_size}</strong>
          {' '}
          {community.jury_size === 1 ? 'member' : 'members'}
        </span>
      </div>

      {/* Role badge */}
      {memberRole && (
        <div className="mt-3 px-1">
          <span className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
            memberRole === 'admin' && 'bg-primary/10 text-primary',
            memberRole === 'juror' && 'bg-amber-500/10 text-amber-600',
            memberRole === 'member' && 'bg-muted text-muted-foreground',
          )}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {memberRole === 'admin' ? 'Admin' : memberRole === 'juror' ? 'Juror' : 'Member'}
          </span>
        </div>
      )}

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
