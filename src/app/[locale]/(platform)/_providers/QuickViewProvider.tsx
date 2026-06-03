'use client'

import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import QuickView from '@/app/[locale]/(platform)/_components/quick-view/QuickView'

const AUTO_SHOWN_SESSION_KEY = 'quickview_autoshown'

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
  const autoOpenCheckedRef = useRef(false)

  // Auto-open once per browser session (tab). Refreshes/SPA navigations within
  // the same session won't re-trigger it, so it shows on a fresh visit without
  // hijacking every navigation. Dismissible at any time.
  useEffect(() => {
    if (autoOpenCheckedRef.current) {
      return
    }
    autoOpenCheckedRef.current = true

    let alreadyShown = false
    try {
      alreadyShown = sessionStorage.getItem(AUTO_SHOWN_SESSION_KEY) === 'true'
    }
    catch {
      alreadyShown = false
    }

    if (alreadyShown) {
      return
    }

    const timeout = window.setTimeout(() => {
      try {
        sessionStorage.setItem(AUTO_SHOWN_SESSION_KEY, 'true')
      }
      catch {
        // ignore persistence failures
      }
      setOpen(true)
    }, 700)

    return () => window.clearTimeout(timeout)
  }, [])

  const openQuickView = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])

  return (
    <QuickViewContext.Provider value={{ openQuickView }}>
      {children}
      <QuickView open={open} onClose={close} />
    </QuickViewContext.Provider>
  )
}
