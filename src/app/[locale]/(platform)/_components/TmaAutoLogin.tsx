'use client'

import { useEffect, useRef } from 'react'
import { useAppKit } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { authClient } from '@/lib/auth-client'

const { useSession } = authClient

function isTmaHost() {
  if (typeof window === 'undefined') {
    return false
  }
  const host = window.location.hostname
  return host.startsWith('tma.') || host.includes('tma')
}

export default function TmaAutoLogin() {
  const { open } = useAppKit()
  const { data: session } = useSession()
  const hasHydrated = useHasHydrated()
  const triggered = useRef(false)

  useEffect(() => {
    if (!hasHydrated || triggered.current) {
      return
    }
    if (!isTmaHost()) {
      return
    }
    if (session?.user) {
      return
    }
    triggered.current = true
    open()
  }, [hasHydrated, session, open])

  return null
}
