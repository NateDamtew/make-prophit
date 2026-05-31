'use client'

import { init, on, retrieveLaunchParams } from '@telegram-apps/sdk-react'
import { createContext, use, useReducer } from 'react'

export interface TmaUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
}

const TmaContext = createContext<TmaUser | null>(null)

export function useTmaUser() {
  return use(TmaContext)
}

function initTma(): TmaUser | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    init()
    on('viewport_changed', () => {})
    const { initDataRaw, initData } = retrieveLaunchParams()

    if (initDataRaw) {
      const controller = new AbortController()
      fetch('/api/tma/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: initDataRaw }),
        signal: controller.signal,
      }).catch(() => null)
    }

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

  return (
    <TmaContext value={user}>
      {children}
    </TmaContext>
  )
}
