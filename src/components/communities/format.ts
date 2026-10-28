import { formatPoolMoney } from '@/lib/pools/format'

/**
 * Formatting shared by the Communities UI. Money is always "<amount> <CCY>"
 * in the community's currency, odds are percentages, and countdowns are calm:
 * words when there is time, digits only under two hours.
 */

const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000

/** "1,250 KES" — the one way money is written on community screens. */
export function formatMoney(minor: bigint | string | number | null | undefined, currency: string | null | undefined) {
  return formatPoolMoney(minor, currency)
}

/** "62%" from a 0–1 chance (or 0–100 when `asPercent`). */
export function formatChance(value: number | null | undefined, options?: { asPercent?: boolean }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }
  const pct = options?.asPercent ? value : value * 100
  return `${Math.round(Math.max(0, Math.min(100, pct)))}%`
}

/** "Sat 13 Dec, 11:59 pm" in the viewer's locale, or "today, 6:00 pm" when it is today. */
export function formatCloseLabel(date: Date | string | number, locale: string, now: number | null = null) {
  const target = new Date(date)
  if (Number.isNaN(target.getTime())) {
    return ''
  }
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(target).toLowerCase()
  const reference = now === null ? new Date() : new Date(now)
  const sameDay =
    target.getFullYear() === reference.getFullYear() &&
    target.getMonth() === reference.getMonth() &&
    target.getDate() === reference.getDate()
  if (sameDay) {
    return `today, ${time}`
  }
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(target)
  return `${day}, ${time}`
}

/**
 * Time left, written calmly: "in 3 days", "in 5 hours", then digits once
 * under two hours ("1h 42m 10s"), and "0:48" inside the last minute.
 */
export function formatCountdown(remainingMs: number): string {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return '0:00'
  }
  if (remainingMs < MINUTE) {
    const seconds = Math.floor(remainingMs / 1000)
    return `0:${String(seconds).padStart(2, '0')}`
  }
  if (remainingMs < 2 * HOUR) {
    const hours = Math.floor(remainingMs / HOUR)
    const minutes = Math.floor((remainingMs % HOUR) / MINUTE)
    const seconds = Math.floor((remainingMs % MINUTE) / 1000)
    return hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`
  }
  if (remainingMs < 48 * HOUR) {
    const hours = Math.round(remainingMs / HOUR)
    return `in ${hours} hours`
  }
  const days = Math.round(remainingMs / (24 * HOUR))
  return `in ${days} days`
}

/** Short countdown for strips and cards: "18h 20m", "3d 4h", "42m". */
export function formatShortCountdown(remainingMs: number): string {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return '0m'
  }
  const days = Math.floor(remainingMs / (24 * HOUR))
  const hours = Math.floor((remainingMs % (24 * HOUR)) / HOUR)
  const minutes = Math.floor((remainingMs % HOUR) / MINUTE)
  if (days > 0) {
    return `${days}d ${hours}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

/** "WK" from "Wanjiru Kamau", "K" from "kevo". */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '')
    .trim()
    .replace(/^@/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (words.length === 0) {
    return '?'
  }
  if (words.length === 1) {
    return words[0]!.slice(0, 1).toUpperCase()
  }
  return `${words[0]!.slice(0, 1)}${words[words.length - 1]!.slice(0, 1)}`.toUpperCase()
}

/** "4.6 ★" or "—". */
export function formatRating(rating: number | null | undefined): string {
  if (rating === null || rating === undefined || !Number.isFinite(rating)) {
    return '—'
  }
  return `${rating.toFixed(1)} ★`
}

/** "7%" from basis points. */
export function formatBps(bps: number): string {
  const pct = bps / 100
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`
}
