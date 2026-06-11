import type { LucideIcon } from 'lucide-react'
import {
  ActivityIcon,
  BadgePercentIcon,
  BellIcon,
  BotIcon,
  CalendarIcon,
  ClipboardListIcon,
  HeartPulseIcon,
  LanguagesIcon,
  LayoutDashboardIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SwatchBookIcon,
  TagsIcon,
  TextSelectIcon,
  UsersIcon,
} from 'lucide-react'

export interface AdminNavItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  /** Render disabled with a "Soon" tag — roadmap items not yet built. */
  comingSoon?: boolean
  /** Optional keyword aliases to improve command-palette matching. */
  keywords?: string[]
}

export interface AdminNavGroup {
  id: string
  label?: string
  items: AdminNavItem[]
}

/**
 * Single source of truth for the admin dashboard navigation. Consumed by the
 * sidebar, the breadcrumb resolver, and the command palette so they never drift.
 *
 * `href` values reuse the existing upstream admin routes verbatim, so every
 * current page keeps resolving — we only re-skin the shell around them.
 */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    id: 'top',
    items: [
      { id: 'overview', label: 'Overview', href: '/admin/overview', icon: LayoutDashboardIcon, keywords: ['home', 'dashboard', 'kpi'] },
    ],
  },
  {
    id: 'operate',
    label: 'Operate',
    items: [
      { id: 'events', label: 'Events', href: '/admin/events', icon: CalendarIcon, keywords: ['markets', 'calendar'] },
      { id: 'community-reviews', label: 'Community Reviews', href: '/admin/communities/review', icon: ShieldCheckIcon, keywords: ['resolution', 'moderation'] },
      { id: 'sync-jobs', label: 'Sync Jobs', href: '/admin/sync-jobs', icon: RefreshCwIcon, keywords: ['cron', 'jobs'] },
      { id: 'notifications', label: 'Notifications', href: '/admin/notifications', icon: BellIcon, keywords: ['announce', 'broadcast'] },
    ],
  },
  {
    id: 'grow',
    label: 'Grow',
    items: [
      { id: 'waitlist', label: 'Waitlist', href: '/admin/waitlist', icon: ClipboardListIcon, keywords: ['signups', 'invite', 'email'] },
      { id: 'affiliate', label: 'Affiliate & Fees', href: '/admin/affiliate', icon: BadgePercentIcon, keywords: ['referral', 'fees'] },
      { id: 'analytics', label: 'Analytics', href: '/admin/analytics', icon: ActivityIcon, keywords: ['metrics', 'charts'] },
    ],
  },
  {
    id: 'people',
    label: 'People',
    items: [
      { id: 'users', label: 'Users', href: '/admin/users', icon: UsersIcon, keywords: ['accounts', 'members'] },
      { id: 'agents', label: 'Agents', href: '/admin/agents', icon: BotIcon, keywords: ['bots', 'api keys'] },
    ],
  },
  {
    id: 'configure',
    label: 'Configure',
    items: [
      { id: 'general', label: 'General', href: '/admin', icon: SettingsIcon, keywords: ['settings', 'identity', 'branding'] },
      { id: 'theme', label: 'Theme', href: '/admin/theme', icon: SwatchBookIcon, keywords: ['colors', 'appearance'] },
      { id: 'locales', label: 'Locales', href: '/admin/locales', icon: LanguagesIcon, keywords: ['languages', 'i18n'] },
      { id: 'categories', label: 'Categories', href: '/admin/categories', icon: TagsIcon, keywords: ['tags'] },
      { id: 'market-context', label: 'Market Context', href: '/admin/market-context', icon: TextSelectIcon, keywords: ['ai', 'openrouter'] },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { id: 'audit-log', label: 'Audit Log', href: '/admin/audit-log', icon: ClipboardListIcon, keywords: ['history', 'changes'] },
      { id: 'health', label: 'Health', href: '/admin/health', icon: HeartPulseIcon, keywords: ['status', 'diagnostics'] },
    ],
  },
]

/** Flattened list of all items for matching/breadcrumbs. */
const ADMIN_NAV_ITEMS: AdminNavItem[] = ADMIN_NAV.flatMap(group => group.items)

/**
 * Resolve the active nav item for a pathname. The General item lives at exactly
 * `/admin`, so it only matches the bare path; every other item also matches its
 * sub-routes.
 */
export function resolveActiveNavItem(pathname: string): AdminNavItem | undefined {
  // Normalise: strip a leading locale segment like /en/admin -> /admin.
  const normalized = pathname.replace(/^\/[a-z]{2}(?=\/admin)/, '')

  const exact = ADMIN_NAV_ITEMS.find(item => item.href === normalized)
  if (exact && exact.id !== 'general') {
    return exact
  }

  if (normalized === '/admin') {
    return ADMIN_NAV_ITEMS.find(item => item.id === 'general')
  }

  // Longest matching prefix wins (so /admin/events/calendar -> Events).
  return ADMIN_NAV_ITEMS
    .filter(item => item.href !== '/admin' && normalized.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]
    ?? exact
}
