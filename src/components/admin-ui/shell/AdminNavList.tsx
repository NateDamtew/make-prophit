'use client'

import AppLink from '@/components/AppLink'
import { usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { ADMIN_NAV, resolveActiveNavItem } from '../nav'

interface AdminNavListProps {
  collapsed?: boolean
  /** Called when a real nav link is activated (used to close the mobile drawer). */
  onNavigate?: () => void
}

export function AdminNavList({ collapsed = false, onNavigate }: AdminNavListProps) {
  const pathname = usePathname()
  const activeId = resolveActiveNavItem(pathname)?.id

  return (
    <nav className="grid gap-4">
      {ADMIN_NAV.map(group => (
        <div key={group.id} className="grid gap-1">
          {group.label && !collapsed && (
            <p className="px-3 pb-0.5 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
              {group.label}
            </p>
          )}
          {group.label && collapsed && <div className="mx-3 my-1 h-px bg-border/60" />}

          {group.items.map((item) => {
            const isActive = activeId === item.id
            const Icon = item.icon

            const inner = (
              <>
                <Icon
                  className={cn(
                    'size-4.5 shrink-0',
                    isActive ? 'text-primary' : 'text-muted-foreground',
                  )}
                />
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                {!collapsed && item.comingSoon && (
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                    Soon
                  </span>
                )}
              </>
            )

            const baseClass = cn(
              'flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
              collapsed && 'justify-center px-0',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-foreground/80 hover:bg-accent/60 hover:text-foreground',
            )

            if (item.comingSoon) {
              return (
                <span
                  key={item.id}
                  title={collapsed ? `${item.label} (soon)` : undefined}
                  aria-disabled
                  className={cn(baseClass, 'cursor-not-allowed opacity-50 hover:bg-transparent')}
                >
                  {inner}
                </span>
              )
            }

            return (
              <AppLink
                key={item.id}
                intentPrefetch
                href={item.href as Parameters<typeof AppLink>[0]['href']}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={baseClass}
              >
                {inner}
              </AppLink>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
