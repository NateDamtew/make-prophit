'use client'

import { init, on, retrieveLaunchParams } from '@telegram-apps/sdk-react'
import { createContext, use, useEffect, useReducer, useRef } from 'react'

export interface TmaUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
}

interface TmaContextValue {
  user: TmaUser | null
  verified: boolean
}

const TmaContext = createContext<TmaContextValue>({ user: null, verified: false })

export function useTmaUser() {
  return use(TmaContext).user
}

function initTma(): TmaUser | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    init()
    on('viewport_changed', () => {})
    const { initData } = retrieveLaunchParams()

    const u = (initData as any)?.user
    if (u && typeof u.id === 'number') {
      return u as TmaUser
    }
    return null
  }
  catch {
    return null
  }
}

export default function TmaProvider({ children }: { children: React.ReactNode }) {
  const [user] = useReducer((_: TmaUser | null) => initTma(), null, initTma)
  const verifiedRef = useRef(false)
  const [verified, setVerified] = useReducer(() => true, false)

  useEffect(() => {
    if (verifiedRef.current || typeof window === 'undefined') {
      return
    }
    verifiedRef.current = true

    try {
      const { initDataRaw } = retrieveLaunchParams()
      if (!initDataRaw) {
        return
      }

      const controller = new AbortController()
      fetch('/api/tma/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: initDataRaw }),
        signal: controller.signal,
      })
        .then((res) => {
          if (res.ok) {
            setVerified()
          }
          else {
            console.warn('TMA auth verification failed:', res.status)
          }
        })
        .catch(() => null)

      return () => controller.abort()
    }
    catch {
      // Not inside Telegram
    }
  }, [])

  return (
    <TmaContext value={{ user, verified }}>
      {children}
    </TmaContext>
  )
}
