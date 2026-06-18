/**
 * Telegram Mini App (TMA) context detection.
 *
 * Two independent signals:
 * - `isTmaHost()` — served from a `tma.*` hostname (our dedicated TMA domain).
 * - `isInsideTelegram()` — running inside a real Telegram WebView.
 *
 * These are intentionally conservative: `telegram-web-app.js` loaded in a normal
 * browser creates a stub `Telegram.WebApp` with `platform === 'unknown'`, so we
 * only trust `initData` or a concrete platform — never `version`/`colorScheme`,
 * which produce false positives on the public site.
 */

export function isTmaHost(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const host = window.location.hostname
  return host.startsWith('tma.') || host.includes('tma')
}

export function isInsideTelegram(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const webApp = (window as any).Telegram?.WebApp
  if (!webApp) {
    return false
  }
  if (webApp.initData) {
    return true
  }
  return (
    typeof webApp.platform === 'string'
    && webApp.platform !== ''
    && webApp.platform !== 'unknown'
  )
}

/** True when running in any Telegram Mini App context (TMA host or Telegram WebView). */
export function isTmaContext(): boolean {
  return isTmaHost() || isInsideTelegram()
}

export function getTelegramInitData(): string {
  if (typeof window === 'undefined') {
    return ''
  }
  return (window as any).Telegram?.WebApp?.initData ?? ''
}
