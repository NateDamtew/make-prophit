'use client'

import type { ComponentPropsWithoutRef, ComponentRef, Ref } from 'react'

import { useState } from 'react'

import { Link } from '@/i18n/navigation'

type NextLinkPrefetch = ComponentPropsWithoutRef<typeof Link>['prefetch']
type AppLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, 'prefetch'> & {
  intentPrefetch?: boolean
  prefetch?: NextLinkPrefetch
  ref?: Ref<AppLinkRef>
}
type AppLinkRef = ComponentRef<typeof Link>

function useIntentPrefetch(intentPrefetch: boolean, prefetch: NextLinkPrefetch | false) {
  const [shouldPrefetch, setShouldPrefetch] = useState(false)
  const nextPrefetch = prefetch === false ? null : prefetch
  const resolvedPrefetch = intentPrefetch ? (shouldPrefetch ? nextPrefetch : false) : prefetch

  function enableIntentPrefetch() {
    setShouldPrefetch(true)
  }

  return { resolvedPrefetch, enableIntentPrefetch }
}

function AppLink({
  ref,
  intentPrefetch = false,
  onFocus,
  onMouseEnter,
  onTouchStart,
  prefetch = false,
  ...props
}: AppLinkProps) {
  const { resolvedPrefetch, enableIntentPrefetch } = useIntentPrefetch(intentPrefetch, prefetch)

  return (
    <Link
      ref={ref}
      {...props}
      prefetch={resolvedPrefetch}
      onMouseEnter={(event) => {
        if (intentPrefetch) {
          enableIntentPrefetch()
        }
        onMouseEnter?.(event)
      }}
      onFocus={(event) => {
        if (intentPrefetch) {
          enableIntentPrefetch()
        }
        onFocus?.(event)
      }}
      onTouchStart={(event) => {
        if (intentPrefetch) {
          enableIntentPrefetch()
        }
        onTouchStart?.(event)
      }}
    />
  )
}

export default AppLink
