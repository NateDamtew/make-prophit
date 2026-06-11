'use client'

import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import { AdminNavList } from '@/components/admin-ui/shell/AdminNavList'
import { useAdminSidebar } from '@/components/admin-ui/shell/SidebarProvider'
import { cn } from '@/lib/utils'

/**
 * Desktop admin sidebar. Collapsible (icon-only) with state persisted to a
 * cookie via {@link useAdminSidebar}. The nav list itself lives in AdminNavList
 * so the mobile drawer can reuse it. Hidden below lg — mobile uses the header's
 * drawer trigger.
 */
export default function AdminSidebar() {
  const { collapsed, toggleCollapsed } = useAdminSidebar()

  return (
    <aside
      className={cn(
        `
          sticky top-0 hidden h-svh shrink-0 flex-col border-r border-border/60 bg-card transition-[width] duration-200
          lg:flex
        `,
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <AdminNavList collapsed={collapsed} />
      </div>

      <div className="border-t border-border/60 p-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            `
              flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground
              transition-colors
              hover:bg-accent/60 hover:text-foreground
            `,
            collapsed && 'justify-center px-0',
          )}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <PanelLeftOpenIcon className="size-4.5" />
            : <PanelLeftCloseIcon className="size-4.5" />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
