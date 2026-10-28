'use client'

import {
  ActivityIcon,
  CheckIcon,
  Code2Icon,
  CopyIcon,
  MoreHorizontalIcon,
  PaintbrushIcon,
  PlusIcon,
  SettingsIcon,
  Share2Icon,
  SmartphoneIcon,
} from 'lucide-react'
import { useExtracted } from 'next-intl'
import { useState, useTransition } from 'react'

import type { CommunityTrust } from '@/components/communities/types'

import { formatMoney } from '@/components/communities/format'
import { useMobileMoneySummary } from '@/components/communities/money/useMobileMoney'
import { LeaderTypeBadge } from '@/components/communities/trust/LeaderTypeBadge'
import { LevelBadge } from '@/components/communities/trust/LevelBadge'
import { TrustBlock } from '@/components/communities/trust/TrustBlock'
import { VerifiedBadge } from '@/components/community-engagement/VerifiedBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toast'
import { useAppKit } from '@/hooks/useAppKit'
import { Link } from '@/i18n/navigation'
import { isCommunityRole, isOwnerRole, ROLE_LABELS } from '@/lib/communities/roles'
import { cn } from '@/lib/utils'

import { generateInviteAction, joinCommunityAction, leaveCommunityAction } from '../../_actions/community-actions'

/**
 * The community's identity row: icon, name, level, who leads it, the trust
 * strip, and the one action for the viewer (join, your balance + deposit,
 * or the owner's tools). Sits under the platform header, inside the page.
 */

interface HeaderCommunity {
  id: string
  slug: string
  name: string
  description: string | null
  banner_url?: string | null
  icon_url?: string | null
  type: string
  jury_size: number
  max_members: number
  member_count: number
  is_verified?: boolean | null
}

interface CommunityHeaderProps {
  community: HeaderCommunity
  trust: CommunityTrust | null
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

function BalanceChip({ slug }: { slug: string }) {
  const t = useExtracted()
  const money = useMobileMoneySummary()
  const data = money.data
  if (!data || !data.currency) {
    return (
      <Button
        variant="secondary"
        size="sm"
        nativeButton={false}
        render={<Link href={`/community/${slug}?sheet=deposit`} />}
      >
        <SmartphoneIcon className="size-4" aria-hidden="true" />
        {t('Deposit')}
      </Button>
    )
  }
  return (
    <Link
      href={`/community/${slug}?sheet=deposit`}
      className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm tabular-nums"
    >
      <span className="text-muted-foreground">{t('Balance')}</span>
      <strong>{formatMoney(data.availableMinor, data.currency)}</strong>
      <span className="font-semibold text-primary">{t('Deposit')}</span>
    </Link>
  )
}

export default function CommunityHeader({ community, trust, memberRole, currentUserId }: CommunityHeaderProps) {
  const t = useExtracted()
  const { open: openAppKit } = useAppKit()
  const [isPending, startTransition] = useTransition()
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const isMember = Boolean(memberRole)
  const isOwner = isOwnerRole(memberRole)
  const roleLabel = isCommunityRole(memberRole) ? ROLE_LABELS[memberRole] : null
  const joinsPaused = trust?.joinsPaused ?? false
  const full = community.member_count >= (trust?.caps.maxMembers ?? community.max_members)

  function handleJoin() {
    if (!currentUserId) {
      void openAppKit()
      return
    }
    startTransition(async () => {
      const result = await joinCommunityAction(community.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('Welcome to {name}!', { name: community.name }))
      }
    })
  }

  function handleLeave() {
    startTransition(async () => {
      const result = await leaveCommunityAction(community.id, community.slug)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t('You have left the community.'))
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
  }

  async function copyInviteLink() {
    if (!inviteCode) {
      return
    }
    await navigator.clipboard.writeText(`${window.location.origin}/community/${community.slug}?invite=${inviteCode}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <header className="flex flex-col gap-4">
      {community.banner_url ? (
        <div className="h-28 overflow-hidden rounded-xl bg-secondary sm:h-40">
          <img src={community.banner_url} alt="" className="size-full object-cover" />
        </div>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary text-2xl sm:size-16">
            {community.icon_url ? (
              <img src={community.icon_url} alt="" className="size-full object-cover" />
            ) : (
              <span className="size-6 rounded-sm bg-(--community-accent,var(--color-muted-foreground))" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="flex items-center gap-1.5 text-[22px]/tight font-bold sm:text-[26px]/tight">
                <span className="truncate">{community.name}</span>
                <VerifiedBadge isVerified={community.is_verified} />
              </h1>
              {trust ? <LevelBadge level={trust.level} name={trust.levelName} size="sm" /> : null}
              {trust?.leaderType ? <LeaderTypeBadge type={trust.leaderType} className="h-6 text-[11px]" /> : null}
              {roleLabel ? (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    isOwner ? 'bg-foreground text-background' : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  {roleLabel}
                </span>
              ) : null}
            </div>
            {community.description ? (
              <p className="mt-1.5 max-w-2xl text-sm/relaxed text-muted-foreground">{community.description}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground tabular-nums">
              {trust ? <TrustBlock trust={trust} variant="mini" /> : null}
              <span>
                <strong className="font-semibold text-foreground">{formatCompact(community.member_count)}</strong>{' '}
                {t('of {max} members', { max: formatCompact(trust?.caps.maxMembers ?? community.max_members) })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {isOwner ? (
            <>
              <Button
                size="sm"
                nativeButton={false}
                render={<Link href={`/community/${community.slug}/markets/new`} />}
              >
                <PlusIcon className="size-4" aria-hidden="true" />
                {t('Add market')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void handleGenerateInvite()}>
                <Share2Icon className="size-4" aria-hidden="true" />
                {t('Invite')}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="secondary" size="icon" aria-label={t('More')} />}>
                  <MoreHorizontalIcon className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem render={<Link href={`/community/${community.slug}/settings`} />}>
                    <SettingsIcon className="size-4" />
                    {t('Settings')}
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href={`/community/${community.slug}/theme`} />}>
                    <PaintbrushIcon className="size-4" />
                    {t('Layout & branding')}
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href={`/community/${community.slug}/insights`} />}>
                    <ActivityIcon className="size-4" />
                    {t('Insights')}
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href={`/community/${community.slug}/embed-settings`} />}>
                    <Code2Icon className="size-4" />
                    {t('Embed codes')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : isMember ? (
            <>
              {currentUserId ? <BalanceChip slug={community.slug} /> : null}
              <Button variant="ghost" size="sm" onClick={handleLeave} disabled={isPending}>
                {isPending ? t('Leaving…') : t('Leave')}
              </Button>
            </>
          ) : community.type === 'public' ? (
            joinsPaused || full ? (
              <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                {full ? t('Full for now') : t('Joins paused')}
              </span>
            ) : (
              <Button size="sm" onClick={handleJoin} disabled={isPending}>
                {isPending ? t('Joining…') : currentUserId ? t('Join') : t('Sign up to join')}
              </Button>
            )
          ) : null}
        </div>
      </div>

      <Dialog open={inviteCode !== null} onOpenChange={(open) => (open ? null : setInviteCode(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Invite link')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('Share this link to invite people. It expires in 7 days.')}
          </p>
          <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm">
            <span className="flex-1 truncate font-mono text-xs">
              {typeof window !== 'undefined' ? window.location.origin : ''}/community/{community.slug}?invite=
              {inviteCode}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void copyInviteLink()} className="shrink-0">
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}
