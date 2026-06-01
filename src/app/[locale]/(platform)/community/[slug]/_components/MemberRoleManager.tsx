'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Crown, Gavel, User, Check } from 'lucide-react'
import { setMemberRoleAction } from '../_actions/community-actions'
import { cn } from '@/lib/utils'

interface Props {
  communityId: string
  communitySlug: string
  targetUserId: string
  currentRole: string
  jurySize: number
  currentJurorCount: number
  isSelf: boolean
}

const ROLE_OPTIONS = [
  { id: 'admin' as const, label: 'Admin', icon: Crown, color: 'text-primary' },
  { id: 'juror' as const, label: 'Juror', icon: Gavel, color: 'text-amber-600' },
  { id: 'member' as const, label: 'Member', icon: User, color: 'text-muted-foreground' },
]

export default function MemberRoleManager({
  communityId,
  communitySlug,
  targetUserId,
  currentRole,
  jurySize,
  currentJurorCount,
  isSelf,
}: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleChange(newRole: 'admin' | 'juror' | 'member') {
    if (newRole === currentRole) {
      setIsOpen(false)
      return
    }

    // Jury capacity check
    if (newRole === 'juror' && currentRole !== 'admin' && currentJurorCount >= jurySize) {
      toast.error(`Jury is full (${currentJurorCount}/${jurySize}). Demote someone first or increase the jury size.`)
      setIsOpen(false)
      return
    }

    if (isSelf && currentRole === 'admin' && newRole !== 'admin') {
      const confirmed = confirm('You are demoting yourself. You will lose admin privileges. Continue?')
      if (!confirmed) {
        setIsOpen(false)
        return
      }
    }

    startTransition(async () => {
      const result = await setMemberRoleAction(communityId, targetUserId, newRole, communitySlug)
      if (result.error) {
        toast.error(result.error)
      }
      else {
        toast.success('Role updated')
        setIsOpen(false)
      }
    })
  }

  const currentOption = ROLE_OPTIONS.find(o => o.id === currentRole) ?? ROLE_OPTIONS[2]
  const CurrentIcon = currentOption.icon

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        disabled={isPending}
        className={cn(
          'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
          currentRole === 'admin' && 'bg-primary/10 text-primary hover:bg-primary/15',
          currentRole === 'juror' && 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/15',
          currentRole === 'member' && 'bg-muted text-muted-foreground hover:bg-muted/70',
        )}
      >
        <CurrentIcon className="size-3" />
        {currentOption.label}
        <ChevronDown className={cn('size-3 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border bg-background shadow-lg">
            <div className="border-b p-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Change role
              </p>
            </div>
            {ROLE_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const isCurrent = opt.id === currentRole
              const wouldExceedCapacity = opt.id === 'juror'
                && currentRole !== 'admin'
                && currentJurorCount >= jurySize
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleChange(opt.id)}
                  disabled={isPending || wouldExceedCapacity}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                    !isCurrent && !wouldExceedCapacity && 'hover:bg-muted/50',
                    isCurrent && 'bg-muted/30',
                    wouldExceedCapacity && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <Icon className={cn('size-3.5', opt.color)} />
                  <span className="flex-1">{opt.label}</span>
                  {isCurrent && <Check className="size-3.5 text-muted-foreground" />}
                  {wouldExceedCapacity && (
                    <span className="text-[10px] text-muted-foreground">Full</span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
