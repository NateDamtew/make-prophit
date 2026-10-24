import type { CustomJavascriptCodeConfig } from '@/lib/custom-javascript-code'

import { sanitizeSvg } from '@/lib/utils'

const THEME_SITE_LOGO_MODES = ['svg', 'image'] as const
export type ThemeSiteLogoMode = (typeof THEME_SITE_LOGO_MODES)[number]

const THEME_SITE_SOCIAL_LINK_FIELDS = [
  'discordLink',
  'twitterLink',
  'facebookLink',
  'instagramLink',
  'tiktokLink',
  'linkedinLink',
  'youtubeLink',
] as const
export type ThemeSiteSocialLinkField = (typeof THEME_SITE_SOCIAL_LINK_FIELDS)[number]

const THEME_SITE_LOGO_MODE_SET = new Set<string>(THEME_SITE_LOGO_MODES)
// Prophit branding, used when the site settings can't be loaded (e.g. the database is unreachable).
// Keep in sync with the `site_*` rows in the general settings group.
const DEFAULT_SITE_NAME_FALLBACK = 'Prophit'
const DEFAULT_SITE_DESCRIPTION_FALLBACK = 'Prediction Market for The Next Billions'
const DEFAULT_SITE_LOGO_SVG_FALLBACK = `
<svg viewBox="0 0 512 512" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <g>
    <path class="st0" d="M108.2,433.27c0-2.18,0-3.62,0-5.05c0-81.81,0.04-163.61-0.06-245.42c-0.01-8.09,2.81-14.15,9.88-18.22c42.27-24.37,84.56-48.71,126.75-73.22c7.58-4.41,14.56-4.43,22.16-0.02c41.6,24.16,83.26,48.23,125.01,72.14c8.01,4.59,11.71,10.76,11.67,20.12c-0.21,48.03-0.19,96.05-0.01,144.08c0.03,9.15-3.61,15.27-11.52,19.79c-38.24,21.86-76.34,43.99-114.53,65.93c-4.86,2.79-7.11,6.56-7.09,12.21c0.12,26.86,0.05,53.72,0.06,80.59c0,1.11,0.17,2.23,0.28,3.55c0.9-0.38,1.42-0.54,1.88-0.81c57.51-33.21,115.14-66.22,172.48-99.73c25.62-14.98,38.39-38.11,38.51-67.72c0.23-57.12,0.19-114.23,0.01-171.35c-0.09-30.09-12.98-53.28-39.04-68.64C422.58,88.48,400.31,75.81,378.12,63c-28.41-16.39-56.62-33.14-85.32-49.02c-24.48-13.54-49.58-13.25-74.19,0.11c-14.05,7.63-27.77,15.86-41.62,23.86c-36.51,21.07-73.06,42.08-109.49,63.27c-25.54,14.86-39.13,37.34-39.37,66.78c-0.48,58.33-0.45,116.68-0.01,175.01c0.22,29.13,13.71,51.36,38.68,66.41c10.33,6.23,20.89,12.07,31.35,18.08C101.27,429.31,104.39,431.09,108.2,433.27z M137.48,204.03c0,2.24,0,3.57,0,4.9c0,77.44,0.03,154.89-0.06,232.33c-0.01,6.24,2.38,10.41,7.81,13.52c31.04,17.78,61.98,35.73,92.96,53.61c0.84,0.49,1.79,0.79,2.99,1.32c0-1.32,0-2.13,0-2.94c0-77.72-0.05-155.43,0.08-233.15c0.01-6.91-2.6-11.4-8.59-14.76c-17.48-9.82-34.79-19.97-52.16-30C166.45,220.76,152.39,212.64,137.48,204.03z M152.18,178.7c1.03,0.66,1.47,0.96,1.92,1.23c31.57,18.22,63.14,36.43,94.7,54.67c4.8,2.77,9.4,2.72,14.21-0.07c31.43-18.2,62.9-36.32,94.34-54.48c0.61-0.35,1.14-0.87,1.97-1.52c-32.78-18.91-65.15-37.61-97.55-56.26c-4.6-2.65-9.01-1.75-13.44,0.83c-20.03,11.64-40.13,23.16-60.19,34.75C176.33,164.66,164.52,171.53,152.18,178.7z M374.24,204.28c-1.53,0.74-2.25,1.04-2.93,1.43c-31.32,18.07-62.64,36.17-93.97,54.22c-5.02,2.89-6.87,7.21-6.86,12.85c0.08,35.79,0.04,71.58,0.05,107.37c0,1,0.1,1.99,0.18,3.34c1.15-0.6,1.87-0.93,2.55-1.33c30.85-17.81,61.65-35.71,92.58-53.36c6.01-3.43,8.51-7.94,8.48-14.81c-0.18-34.84-0.08-69.68-0.08-104.53C374.24,208,374.24,206.53,374.24,204.28z"/>
    <path class="st1" d="M108.2,433.27c-3.81-2.18-6.94-3.96-10.05-5.75c-10.46-6.01-21.02-11.86-31.35-18.08c-24.97-15.05-38.46-37.28-38.68-66.41c-0.44-58.33-0.47-116.68,0.01-175.01c0.24-29.44,13.83-51.93,39.37-66.78c36.44-21.2,72.99-42.2,109.49-63.27c13.85-7.99,27.57-16.23,41.62-23.86c24.61-13.36,49.71-13.65,74.19-0.11c28.7,15.88,56.91,32.63,85.32,49.02c22.19,12.8,44.45,25.47,66.52,38.49c26.06,15.37,38.95,38.55,39.04,68.64c0.17,57.12,0.22,114.23-0.01,171.35c-0.12,29.61-12.89,52.74-38.51,67.72c-57.34,33.51-114.96,66.52-172.48,99.73c-0.46,0.26-0.97,0.42-1.88,0.81c-0.11-1.33-0.28-2.44-0.28-3.55c-0.01-26.86,0.06-53.73-0.06-80.59c-0.03-5.65,2.23-9.42,7.09-12.21c38.2-21.94,76.29-44.07,114.53-65.93c7.91-4.52,11.55-10.64,11.52-19.79c-0.18-48.03-0.21-96.05,0.01-144.08c0.04-9.35-3.65-15.53-11.67-20.12c-41.75-23.91-83.41-47.97-125.01-72.14c-7.59-4.41-14.57-4.39-22.16,0.02c-42.19,24.51-84.48,48.85-126.75,73.22c-7.07,4.08-9.89,10.14-9.88,18.22c0.1,81.81,0.06,163.61,0.06,245.42C108.2,429.65,108.2,431.09,108.2,433.27z"/>
    <path class="st1" d="M137.48,204.03c14.91,8.61,28.97,16.72,43.03,24.84c17.37,10.02,34.67,20.17,52.16,30c5.99,3.37,8.6,7.85,8.59,14.76c-0.13,77.72-0.08,155.43-0.08,233.15c0,0.81,0,1.62,0,2.94c-1.2-0.52-2.15-0.83-2.99-1.32c-30.98-17.88-61.92-35.83-92.96-53.61c-5.43-3.11-7.81-7.28-7.81-13.52c0.09-77.44,0.06-154.89,0.06-232.33C137.48,207.6,137.48,206.27,137.48,204.03z"/>
    <path class="st1" d="M152.18,178.7c12.35-7.16,24.15-14.03,35.97-20.86c20.06-11.59,40.16-23.11,60.19-34.75c4.43-2.57,8.83-3.48,13.44-0.83c32.4,18.66,64.78,37.35,97.55,56.26c-0.83,0.65-1.36,1.16-1.97,1.52c-31.45,18.16-62.92,36.29-94.34,54.48c-4.81,2.79-9.42,2.84-14.21,0.07c-31.56-18.24-63.13-36.45-94.7-54.67C153.64,179.66,153.21,179.35,152.18,178.7z"/>
    <path class="st1" d="M374.24,204.28c0,2.24,0,3.72,0,5.19c0,34.84-0.1,69.69,0.08,104.53c0.03,6.87-2.47,11.38-8.48,14.81c-30.94,17.65-61.73,35.55-92.58,53.36c-0.68,0.39-1.4,0.73-2.55,1.33c-0.07-1.35-0.18-2.34-0.18-3.34c-0.01-35.79,0.03-71.58-0.05-107.37c-0.01-5.64,1.84-9.96,6.86-12.85c31.34-18.05,62.65-36.15,93.97-54.22C371.99,205.33,372.72,205.03,374.24,204.28z"/>
  </g>
</svg>
`

const SVG_ROOT_TAG_PATTERN = /<svg\b[^>]*>/i
const SVG_DIMENSION_ATTR_PATTERN = /\s(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi
const SVG_WIDTH_ATTR_PATTERN = /\swidth\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const SVG_HEIGHT_ATTR_PATTERN = /\sheight\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i
const SVG_VIEWBOX_ATTR_PATTERN = /\sviewbox\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i
const HTTP_URL_PROTOCOL_PATTERN = /^https?:\/\//i
const MAILTO_PROTOCOL_PATTERN = /^mailto:/i

export interface ThemeSiteSocialLinks {
  discordLink: string | null
  twitterLink: string | null
  facebookLink: string | null
  instagramLink: string | null
  tiktokLink: string | null
  linkedinLink: string | null
  youtubeLink: string | null
}

export interface ThemeSiteIdentity extends ThemeSiteSocialLinks {
  name: string
  description: string
  logoMode: ThemeSiteLogoMode
  logoSvg: string
  logoImagePath: string | null
  logoImageUrl: string | null
  logoUrl: string
  googleAnalyticsId: string | null
  supportUrl: string | null
  customJavascriptCodes: CustomJavascriptCodeConfig[]
  pwaIcon192Path: string | null
  pwaIcon512Path: string | null
  pwaIcon192Url: string
  pwaIcon512Url: string
  appleTouchIconUrl: string
}

function sanitizeDefaultLogo() {
  const sanitized = normalizeRootSvgDimensions(sanitizeSvg(DEFAULT_SITE_LOGO_SVG_FALLBACK).trim())
  if (!sanitized || !/<svg[\s>]/i.test(sanitized)) {
    return normalizeRootSvgDimensions(sanitizeSvg(DEFAULT_SITE_LOGO_SVG_FALLBACK).trim())
  }

  return sanitized
}

export const DEFAULT_THEME_SITE_NAME = DEFAULT_SITE_NAME_FALLBACK
const DEFAULT_THEME_SITE_DESCRIPTION = DEFAULT_SITE_DESCRIPTION_FALLBACK
export const DEFAULT_THEME_SITE_LOGO_SVG = sanitizeDefaultLogo()
export const DEFAULT_THEME_SITE_PWA_ICON_192_URL = '/images/pwa/default-icon-192.png'
export const DEFAULT_THEME_SITE_PWA_ICON_512_URL = '/images/pwa/default-icon-512.png'

export function buildSvgDataUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function createDefaultThemeSiteIdentity(): ThemeSiteIdentity {
  const logoSvg = DEFAULT_THEME_SITE_LOGO_SVG

  return {
    name: DEFAULT_THEME_SITE_NAME,
    description: DEFAULT_THEME_SITE_DESCRIPTION,
    logoMode: 'svg',
    logoSvg,
    logoImagePath: null,
    logoImageUrl: null,
    logoUrl: buildSvgDataUri(logoSvg),
    googleAnalyticsId: null,
    discordLink: null,
    twitterLink: null,
    facebookLink: null,
    instagramLink: null,
    tiktokLink: null,
    linkedinLink: null,
    youtubeLink: null,
    supportUrl: null,
    customJavascriptCodes: [],
    pwaIcon192Path: null,
    pwaIcon512Path: null,
    pwaIcon192Url: DEFAULT_THEME_SITE_PWA_ICON_192_URL,
    pwaIcon512Url: DEFAULT_THEME_SITE_PWA_ICON_512_URL,
    appleTouchIconUrl: DEFAULT_THEME_SITE_PWA_ICON_192_URL,
  }
}

function normalizeOptionalString(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized.length > 0 ? normalized : null
}

export function getThemeSiteSameAs(site: Pick<ThemeSiteSocialLinks, ThemeSiteSocialLinkField>) {
  const seen = new Set<string>()
  const sameAs: string[] = []

  for (const field of THEME_SITE_SOCIAL_LINK_FIELDS) {
    const value = site[field]?.trim()
    if (!value || seen.has(value)) {
      continue
    }

    seen.add(value)
    sameAs.push(value)
  }

  return sameAs
}

function extractAttributeValue(match: RegExpMatchArray | null) {
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim()
}

function parseSvgDimension(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) / 1000 : null
}

function addViewBoxAttribute(svgRootTag: string, viewBoxValue: string) {
  if (svgRootTag.endsWith('/>')) {
    return `${svgRootTag.slice(0, -2)} viewBox="${viewBoxValue}" />`
  }
  return `${svgRootTag.slice(0, -1)} viewBox="${viewBoxValue}">`
}

function normalizeRootSvgDimensions(svg: string) {
  const rootTagMatch = svg.match(SVG_ROOT_TAG_PATTERN)
  if (!rootTagMatch) {
    return svg
  }

  const rootTag = rootTagMatch[0]
  const hasViewBox = SVG_VIEWBOX_ATTR_PATTERN.test(rootTag.toLowerCase())
  const widthValue = parseSvgDimension(extractAttributeValue(rootTag.match(SVG_WIDTH_ATTR_PATTERN)))
  const heightValue = parseSvgDimension(extractAttributeValue(rootTag.match(SVG_HEIGHT_ATTR_PATTERN)))

  let normalizedRootTag = rootTag.replace(SVG_DIMENSION_ATTR_PATTERN, '')

  if (!hasViewBox && widthValue && heightValue) {
    normalizedRootTag = addViewBoxAttribute(normalizedRootTag, `0 0 ${widthValue} ${heightValue}`)
  }

  return svg.replace(rootTag, normalizedRootTag)
}

export function validateThemeSiteGoogleAnalyticsId(value: string | null | undefined, sourceLabel: string) {
  const normalized = normalizeOptionalString(value)
  if (!normalized) {
    return { value: null, error: null as string | null }
  }

  if (normalized.length > 120) {
    return { value: null, error: `${sourceLabel} is too long.` }
  }

  if (!/^G-[A-Z0-9]+$/.test(normalized)) {
    return { value: null, error: `${sourceLabel} has an invalid format.` }
  }

  return { value: normalized, error: null }
}

function validateThemeSiteHttpUrl(normalized: string, sourceLabel: string) {
  if (normalized.length > 2048) {
    return { value: null, error: `${sourceLabel} is too long.` }
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(normalized) && !/^https?:\/\//i.test(normalized)) {
    return { value: null, error: `${sourceLabel} must start with http:// or https://.` }
  }

  const withProtocol = HTTP_URL_PROTOCOL_PATTERN.test(normalized) ? normalized : `https://${normalized}`
  try {
    const parsed = new URL(withProtocol)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { value: null, error: `${sourceLabel} must start with http:// or https://.` }
    }
  } catch {
    return { value: null, error: `${sourceLabel} must be a valid URL.` }
  }

  return { value: withProtocol, error: null }
}

function looksLikeEmailAddress(value: string) {
  if (value.includes(' ') || /[/?#]/.test(value)) {
    return false
  }

  const atIndex = value.indexOf('@')
  if (atIndex <= 0 || atIndex !== value.lastIndexOf('@') || atIndex === value.length - 1) {
    return false
  }

  const localPart = value.slice(0, atIndex)
  const domain = value.slice(atIndex + 1)
  if (!localPart || !domain || domain.startsWith('.') || domain.endsWith('.') || !domain.includes('.')) {
    return false
  }

  return domain.split('.').every((label) => label.length > 0)
}

function validateThemeSiteMailtoUrl(normalized: string, sourceLabel: string) {
  if (normalized.length > 2048) {
    return { value: null, error: `${sourceLabel} is too long.` }
  }

  try {
    const parsed = new URL(normalized)
    const emailAddress = decodeURIComponent(parsed.pathname).trim()

    if (parsed.protocol !== 'mailto:' || !looksLikeEmailAddress(emailAddress)) {
      return { value: null, error: `${sourceLabel} must contain a valid email address.` }
    }
  } catch {
    return { value: null, error: `${sourceLabel} must contain a valid email address.` }
  }

  return { value: normalized, error: null }
}

export function validateThemeSiteExternalUrl(value: string | null | undefined, sourceLabel: string) {
  const normalized = normalizeOptionalString(value)
  if (!normalized) {
    return { value: null, error: null as string | null }
  }

  return validateThemeSiteHttpUrl(normalized, sourceLabel)
}

export function validateThemeSiteSupportUrl(value: string | null | undefined, sourceLabel: string) {
  const normalized = normalizeOptionalString(value)
  if (!normalized) {
    return { value: null, error: null as string | null }
  }

  if (MAILTO_PROTOCOL_PATTERN.test(normalized)) {
    return validateThemeSiteMailtoUrl(normalized, sourceLabel)
  }

  if (looksLikeEmailAddress(normalized)) {
    return { value: `mailto:${normalized}`, error: null }
  }

  return validateThemeSiteHttpUrl(normalized, sourceLabel)
}

export function validateThemeSiteName(value: string | null | undefined, sourceLabel: string) {
  const normalized = typeof value === 'string' ? value.trim() : ''

  if (!normalized) {
    return { value: null, error: `${sourceLabel} is required.` }
  }

  if (normalized.length > 80) {
    return { value: null, error: `${sourceLabel} must be at most 80 characters.` }
  }

  return { value: normalized, error: null }
}

export function validateThemeSiteDescription(value: string | null | undefined, sourceLabel: string) {
  const normalized = typeof value === 'string' ? value.trim() : ''

  if (!normalized) {
    return { value: null, error: `${sourceLabel} is required.` }
  }

  if (normalized.length > 180) {
    return { value: null, error: `${sourceLabel} must be at most 180 characters.` }
  }

  return { value: normalized, error: null }
}

function isThemeSiteLogoMode(value: string): value is ThemeSiteLogoMode {
  return THEME_SITE_LOGO_MODE_SET.has(value)
}

export function validateThemeSiteLogoMode(value: string | null | undefined, sourceLabel: string) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''

  if (!normalized) {
    return { value: null, error: `${sourceLabel} is required.` }
  }

  if (!isThemeSiteLogoMode(normalized)) {
    return { value: null, error: `${sourceLabel} is invalid.` }
  }

  return { value: normalized, error: null }
}

export function sanitizeThemeSiteLogoSvg(value: string | null | undefined, sourceLabel: string) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) {
    return { value: null, error: `${sourceLabel} is required.` }
  }

  const sanitized = normalizeRootSvgDimensions(sanitizeSvg(normalized).trim())
  if (!sanitized || !/<svg[\s>]/i.test(sanitized)) {
    return { value: null, error: `${sourceLabel} must be a valid SVG.` }
  }

  if (sanitized.length > 100_000) {
    return { value: null, error: `${sourceLabel} is too large.` }
  }

  return { value: sanitized, error: null }
}

export function validateThemeSiteLogoImagePath(value: string | null | undefined, sourceLabel: string) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) {
    return { value: null, error: null }
  }

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return { value: normalized, error: null }
  }

  if (normalized.length > 256) {
    return { value: null, error: `${sourceLabel} is too long.` }
  }

  if (/[^\w./-]/.test(normalized)) {
    return { value: null, error: `${sourceLabel} contains unsupported characters.` }
  }

  return { value: normalized, error: null }
}
