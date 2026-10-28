'use client'

import type { ReactNode } from 'react'

import { useEffect } from 'react'

import { useSheetState } from '@/components/communities/sheet/sheet-state'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'

/**
 * One sheet for every community flow: a bottom drawer on phones, a centred
 * dialog on desktop. The title is read by screen readers; visible headings
 * belong to the content.
 */

interface CommunitySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  /** Dialog width on desktop. */
  size?: 'md' | 'lg'
  className?: string
}

export function CommunitySheet({ open, onOpenChange, title, children, size = 'md', className }: CommunitySheetProps) {
  const isMobile = useIsMobile()
  const opened = useSheetState((state) => state.opened)
  const closed = useSheetState((state) => state.closed)

  useEffect(() => {
    if (!open) {
      return
    }
    opened()
    return () => closed()
  }, [open, opened, closed])

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className={cn('max-h-[95dvh] w-full rounded-t-[20px] pb-[env(safe-area-inset-bottom)]', className)}
        >
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          <div className="overflow-y-auto px-4 pb-5">{children}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('rounded-[20px] p-6', size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md', className)}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}
