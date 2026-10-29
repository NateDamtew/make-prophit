'use client'

import type { ComponentProps } from 'react'

import { useState } from 'react'

import { Link } from '@/i18n/navigation'

type IntentPrefetchLinkProps = Omit<ComponentProps<typeof Link>, 'prefetch'>

/**
 * Prefetches only on hover, focus or touch. Viewport prefetching rendered every
 * event card's page on each home visit, and each render is a billed ISR write.
 */
export default function IntentPrefetchLink({
  href,
  onFocus,
  onMouseEnter,
  onTouchStart,
  ...props
}: IntentPrefetchLinkProps) {
  const hrefKey = typeof href === 'string' ? href : JSON.stringify(href)
  const [intentHref, setIntentHref] = useState<string | null>(null)

  return (
    <Link
      {...props}
      href={href}
      prefetch={intentHref === hrefKey}
      onFocus={(event) => {
        onFocus?.(event)
        if (!event.defaultPrevented) {
          setIntentHref(hrefKey)
        }
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event)
        if (!event.defaultPrevented) {
          setIntentHref(hrefKey)
        }
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event)
        if (!event.defaultPrevented) {
          setIntentHref(hrefKey)
        }
      }}
    />
  )
}
