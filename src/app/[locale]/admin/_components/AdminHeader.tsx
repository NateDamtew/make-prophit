'use client'

import { MenuIcon, SearchIcon } from 'lucide-react'
import AdminHeaderActions from '@/app/[locale]/admin/_components/AdminHeaderActions'
import { useAdminCommand } from '@/components/admin-ui/CommandPalette'
import { resolveActiveNavItem } from '@/components/admin-ui/nav'
import { AdminNavList } from '@/components/admin-ui/shell/AdminNavList'
import { useAdminSidebar } from '@/components/admin-ui/shell/SidebarProvider'
import HeaderLogo from '@/components/HeaderLogo'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

function AdminBreadcrumb() {
  const pathname = usePathname()
  const active = resolveActiveNavItem(pathname)

  return (
    <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-sm sm:flex">
      <span className="text-muted-foreground">Admin</span>
      {active && (
        <>
          <span className="text-muted-foreground/50">/</span>
          <span className="font-medium">{active.label}</span>
        </>
      )}
    </nav>
  )
}

function CommandTrigger() {
  const { open } = useAdminCommand()
  return (
    <button
      type="button"
      onClick={open}
      className="
        hidden items-center gap-2 rounded-md border border-border/70 bg-muted/40 px-2.5 py-1.5 text-sm
        text-muted-foreground transition-colors
        hover:bg-muted
        sm:flex
      "
    >
      <SearchIcon className="size-3.5" />
      <span>Search…</span>
      <kbd className="ml-2 rounded-sm border border-border/70 bg-background px-1.5 py-0.5 text-2xs font-medium">⌘K</kbd>
    </button>
  )
}

export default function AdminHeader({ feeRecipientWallet }: { feeRecipientWallet: string }) {
  const { mobileOpen, setMobileOpen } = useAdminSidebar()

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur-sm">
      <div className={cn('flex h-15 w-full items-center gap-3 px-4 md:h-16 lg:px-6')}>
        {/* Mobile nav trigger */}
        <Drawer swipeDirection="left" open={mobileOpen} onOpenChange={setMobileOpen}>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="
              flex size-9 items-center justify-center rounded-md text-muted-foreground
              hover:bg-accent/60
              lg:hidden
            "
          >
            <MenuIcon className="size-5" />
          </button>
          <DrawerContent className="inset-y-0 right-auto left-0 mt-0 h-full w-72 rounded-none border-r">
            <DrawerTitle className="sr-only">Admin navigation</DrawerTitle>
            <div className="overflow-y-auto px-3 py-4">
              <AdminNavList onNavigate={() => setMobileOpen(false)} />
            </div>
          </DrawerContent>
        </Drawer>

        <HeaderLogo labelSuffix="Admin" />

        <div className="ms-2 hidden lg:block">
          <AdminBreadcrumb />
        </div>

        <div className="ms-auto flex items-center gap-2 sm:gap-3">
          <CommandTrigger />
          <AdminHeaderActions feeRecipientWallet={feeRecipientWallet} />
        </div>
      </div>
    </header>
  )
}
