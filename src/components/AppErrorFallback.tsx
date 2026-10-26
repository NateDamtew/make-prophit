'use client'

import { RotateCcwIcon } from 'lucide-react'
import { useEffect } from 'react'

import AlertBanner from '@/components/AlertBanner'
import { Button } from '@/components/ui/button'
import { isNextClientStaleAssetError } from '@/lib/errors/next-client-stale-assets'
import { isNextNotFoundError } from '@/lib/errors/next-http-fallback'
import { isSiweVerificationError } from '@/lib/errors/siwe'
import { cn } from '@/lib/utils'

interface AppErrorFallbackProps {
  description?: string
  error: Error & { digest?: string }
  reset: () => void
  retryLabel?: string
  title?: string
  variant?: 'inline' | 'page'
}

export default function AppErrorFallback({
  description,
  error,
  reset,
  retryLabel = 'Try again',
  title = 'Something went wrong',
  variant = 'inline',
}: AppErrorFallbackProps) {
  const hasStaleClientAssets = isNextClientStaleAssetError(error)

  useEffect(
    function captureExceptionEffect() {
      if (isNextNotFoundError(error)) {
        return
      }

      if (hasStaleClientAssets) {
        return
      }

      if (isSiweVerificationError(error)) {
        return
      }

      // FORK: imported on demand so the SDK stays out of every page's bundle
      // (see instrumentation-client.ts); a no-op when no DSN is configured.
      void import('@sentry/nextjs').then((Sentry) => Sentry.captureException(error))
    },
    [error, hasStaleClientAssets],
  )

  function handleRetry() {
    if (hasStaleClientAssets) {
      window.location.reload()
      return
    }

    reset()
  }

  return (
    <AlertBanner
      title={title}
      description={
        <>
          {description && <p>{description}</p>}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
              <RotateCcwIcon aria-hidden />
              {retryLabel}
            </Button>
          </div>
        </>
      }
      className={cn('text-left', variant === 'page' && 'mx-auto my-16 w-[min(100%-2rem,32rem)]')}
    />
  )
}
