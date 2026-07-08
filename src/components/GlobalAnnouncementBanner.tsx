'use client'

import type { CustomJavascriptCodeDisablePage } from '@/lib/custom-javascript-code'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import { isCustomJavascriptCodeEnabledOnPathname } from '@/lib/custom-javascript-code'

interface GlobalAnnouncementBannerProps {
  locale: string
  message: string
  linkUrl: string
  disabledOn: CustomJavascriptCodeDisablePage[]
}

function isExternalHttpUrl(value: string) {
  return value.startsWith('https://') || value.startsWith('http://')
}

function stripLocalePrefix(pathname: string | null, locale: string) {
  if (!pathname) {
    return pathname
  }

  const localePrefix = `/${locale}`
  if (pathname === localePrefix) {
    return '/'
  }

  if (pathname.startsWith(`${localePrefix}/`)) {
    return pathname.slice(localePrefix.length)
  }

  return pathname
}

function useLocalizedPathname(locale: string) {
  const pathname = usePathname()
  return useMemo(() => stripLocalePrefix(pathname, locale), [locale, pathname])
}

export default function GlobalAnnouncementBanner({
  locale,
  message,
  linkUrl,
  disabledOn,
}: GlobalAnnouncementBannerProps) {
  const localizedPathname = useLocalizedPathname(locale)
  const hasMessage = message.trim().length > 0
  const isEnabled = isCustomJavascriptCodeEnabledOnPathname({ disabledOn }, localizedPathname)

  // The marketing landing (/landing) never shows the app announcement bar. The
  // home page ('/') is governed by the admin "Disable on → Home" checkbox
  // (disabledOn), so it is intentionally NOT hard-hidden here.
  const isMarketingLanding = localizedPathname?.startsWith('/landing') ?? false

  if (!hasMessage || !isEnabled || isMarketingLanding) {
    return null
  }

  const content = (
    <div className="w-full bg-primary text-primary-foreground">
      <div className="container py-2 text-center text-xs font-semibold sm:text-sm">
        {message}
      </div>
    </div>
  )

  if (!linkUrl) {
    return content
  }

  const opensInNewTab = isExternalHttpUrl(linkUrl)

  return (
    <a
      href={linkUrl}
      className="block transition-opacity hover:opacity-95"
      target={opensInNewTab ? '_blank' : undefined}
      rel={opensInNewTab ? 'noopener noreferrer' : undefined}
    >
      {content}
    </a>
  )
}
