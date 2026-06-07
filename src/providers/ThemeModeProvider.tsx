'use client'

import type { ReactNode } from 'react'
import type { ThemeMode } from '@/lib/theme-settings'
import { createContext, useContext } from 'react'

const ThemeModeContext = createContext<ThemeMode>('both')

export function useThemeMode(): ThemeMode {
  return useContext(ThemeModeContext)
}

interface ThemeModeProviderProps {
  themeMode: ThemeMode
  children: ReactNode
}

export default function ThemeModeProvider({ themeMode, children }: ThemeModeProviderProps) {
  return (
    <ThemeModeContext value={themeMode}>
      {children}
    </ThemeModeContext>
  )
}
