/**
 * Isolated layout for the stream overlay routes (OBS browser sources). No
 * platform shell, no providers, a transparent body, and nothing indexed.
 */
import type { ReactNode } from 'react'

import './overlay.css'

export const metadata = {
  robots: { index: false, follow: false },
}

export default function OverlayLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  )
}
