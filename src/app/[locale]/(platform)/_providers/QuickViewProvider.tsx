'use client'

import type { ReactNode } from 'react'

import dynamic from 'next/dynamic'
import { createContext, useCallback, useContext, useState } from 'react'

// Flash Trade only runs when someone opens it: its code is not part of the page
// bundle and its cards are fetched on that first open, never during page load.
const QuickView = dynamic(() => import('@/app/[locale]/(platform)/_components/quick-view/QuickView'), {
  ssr: false,
})

interface QuickViewContextValue {
  openQuickView: () => void
}

const QuickViewContext = createContext<QuickViewContextValue>({
  openQuickView: () => {},
})

export function useQuickView() {
  return useContext(QuickViewContext)
}

export function QuickViewProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  const openQuickView = useCallback(() => {
    setMounted(true)
    setOpen(true)
  }, [])
  const close = useCallback(() => setOpen(false), [])

  return (
    <QuickViewContext.Provider value={{ openQuickView }}>
      {children}
      {mounted ? <QuickView open={open} onClose={close} /> : null}
    </QuickViewContext.Provider>
  )
}
