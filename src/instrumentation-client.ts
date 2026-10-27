import type { PublicRuntimeConfig } from '@/lib/public-runtime-config.shared'

import { isNextClientStaleAssetError } from '@/lib/errors/next-client-stale-assets'
import { isNextNotFoundError } from '@/lib/errors/next-http-fallback'
import { isSiweVerificationError } from '@/lib/errors/siwe'

declare global {
  interface Window {
    __PUBLIC_RUNTIME_CONFIG__?: Partial<PublicRuntimeConfig>
  }
}

function normalizeSentryDsn(value: string | undefined) {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : undefined
}

function resolveSentryDsn() {
  return typeof window === 'undefined' ? undefined : normalizeSentryDsn(window.__PUBLIC_RUNTIME_CONFIG__?.sentryDsn)
}

// FORK: the Sentry browser SDK (~370 KB) loads only when a DSN is configured,
// as its own chunk, instead of in the bundle every page needs to hydrate.
// Errors thrown before it has loaded are not reported.
const sentryDsn = resolveSentryDsn()
const sentryPromise = sentryDsn
  ? import('@sentry/nextjs').then((Sentry) => {
      Sentry.init({
        dsn: sentryDsn,
        tracesSampleRate: 0.1,
        beforeSend(event, hint) {
          if (isNextNotFoundError(hint.originalException)) {
            return null
          }

          if (isNextClientStaleAssetError(hint.originalException)) {
            return null
          }

          if (isSiweVerificationError(hint.originalException)) {
            return null
          }

          return event
        },
      })
      return Sentry
    })
  : null

export function onRouterTransitionStart(
  ...args: Parameters<typeof import('@sentry/nextjs').captureRouterTransitionStart>
) {
  void sentryPromise?.then((Sentry) => Sentry.captureRouterTransitionStart(...args))
}
