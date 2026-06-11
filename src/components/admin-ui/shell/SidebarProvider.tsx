'use client'

import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react'

const COLLAPSE_COOKIE = 'admin_sidebar_collapsed'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

interface SidebarContextValue {
  collapsed: boolean
  toggleCollapsed: () => void
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function useAdminSidebar(): SidebarContextValue {
  const ctx = use(SidebarContext)
  if (!ctx) {
    throw new Error('useAdminSidebar must be used within AdminSidebarProvider')
  }
  return ctx
}

export function AdminSidebarProvider({ children }: { children: React.ReactNode }) {
  // SSR always renders expanded (the layout is cached and can't read cookies);
  // we restore the persisted preference on mount. Starting from `false` on both
  // server and client avoids a hydration mismatch.
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => !prev)
  }, [])

  // Read persisted preference once on mount.
  useEffect(() => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COLLAPSE_COOKIE}=([^;]*)`))
    if (match && match[1] === '1') {
      setCollapsed(true)
    }
    setHydrated(true)
  }, [])

  // Persist on change (after the initial read so we don't clobber it).
  useEffect(() => {
    if (!hydrated) {
      return
    }
    document.cookie = `${COLLAPSE_COOKIE}=${collapsed ? '1' : '0'}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
  }, [collapsed, hydrated])

  const value = useMemo<SidebarContextValue>(
    () => ({ collapsed, toggleCollapsed, mobileOpen, setMobileOpen }),
    [collapsed, toggleCollapsed, mobileOpen],
  )

  return <SidebarContext value={value}>{children}</SidebarContext>
}
