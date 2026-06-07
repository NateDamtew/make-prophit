'use client'

import type { Route } from 'next'
import type { ComponentProps, ReactNode } from 'react'
import type { SupportedLocale } from '@/i18n/locales'
import {
  BookOpenIcon,
  ChartLineIcon,
  CheckIcon,
  DownloadIcon,
  FileTextIcon,
  HouseIcon,
  InfoIcon,
  MenuIcon,
  SearchIcon,
  SparkleIcon,
  TrophyIcon,
  UnplugIcon,
} from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'
import { lazy, Suspense, useEffect, useState } from 'react'
import { toast } from 'sonner'
import SearchDiscoveryContent from '@/app/[locale]/(platform)/_components/SearchDiscoveryContent'
import { MOBILE_BOTTOM_NAV_OFFSET } from '@/app/[locale]/(platform)/_lib/mobile-bottom-nav'
import AppLink from '@/components/AppLink'
import PwaInstallIosInstructions from '@/components/PwaInstallIosInstructions'
import ThemeSelector from '@/components/ThemeSelector'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
'use client'

import type { Route } from 'next'
import type { ComponentProps, ReactNode } from 'react'
import type { SupportedLocale } from '@/i18n/locales'
import {
  BookOpenIcon,
  ChartLineIcon,
  CheckIcon,
  DownloadIcon,
  FileTextIcon,
  HouseIcon,
  InfoIcon,
  MenuIcon,
  SearchIcon,
  SparkleIcon,
  TrophyIcon,
  UnplugIcon,
} from 'lucide-react'
import { useExtracted, useLocale } from 'next-intl'
import { lazy, Suspense, useEffect, useState } from 'react'
import { toast } from 'sonner'
import SearchDiscoveryContent from '@/app/[locale]/(platform)/_components/SearchDiscoveryContent'
import { MOBILE_BOTTOM_NAV_OFFSET } from '@/app/[locale]/(platform)/_lib/mobile-bottom-nav'
import AppLink from '@/components/AppLink'
import PwaInstallIosInstructions from '@/components/PwaInstallIosInstructions'
import ThemeSelector from '@/components/ThemeSelector'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useAppKit } from '@/hooks/useAppKit'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { LOCALE_LABELS, LOOP_LABELS, normalizeEnabledLocales, SUPPORTED_LOCALES } from '@/i18n/locales'
import { usePathname, useRouter } from '@/i18n/navigation'
import { authClient } from '@/lib/auth-client'
import { stripLocalePrefix, withLocalePrefix } from '@/lib/locale-path'
import { cn } from '@/lib/utils'
import { useThemeMode } from '@/providers/ThemeModeProvider'
import { useUser } from '@/stores/useUser'

const HeaderSearch = lazy(() => import('@/app/[locale]/(platform)/_components/HeaderSearch'))
const HowItWorks = lazy(() => import('@/app/[locale]/(platform)/_components/HowItWorks'))

const { useSession } = authClient

export default function MobileBottomNav() {
  const pathname = usePathname()

  return <MobileBottomNavContent key={pathname} pathname={pathname} />
}

interface MobileBottomNavContentProps {
  pathname: string
}

function useMobileBottomNavState() {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchFocusTrigger, setSearchFocusTrigger] = useState(0)
  const [isGuestMenuOpen, setIsGuestMenuOpen] = useState(false)
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false)

  return {
    isSearchOpen,
    setIsSearchOpen,
    searchFocusTrigger,
    setSearchFocusTrigger,
    isGuestMenuOpen,
    setIsGuestMenuOpen,
    isHowItWorksOpen,
    setIsHowItWorksOpen,
  }
}

function MobileBottomNavContent({ pathname }: MobileBottomNavContentProps) {
  const t = useExtracted()
  const router = useRouter()
  const { open } = useAppKit()
  const { data: session } = useSession()
  const user = useUser()
  const themeMode = useThemeMode()
  const hasHydrated = useHasHydrated()
  const { canShowInstallUi, isIos, isPrompting, requestInstall } = usePwaInstall()
  const {
    isSearchOpen,
    setIsSearchOpen,
    searchFocusTrigger,
    setSearchFocusTrigger,
    isGuestMenuOpen,
    setIsGuestMenuOpen,
    isHowItWorksOpen,
    setIsHowItWorksOpen,
  } = useMobileBottomNavState()

  const isAuthenticated = hasHydrated && (Boolean(session?.user) || Boolean(user))

  function focusMobileSearchInput() {
    const input = document.querySelector<HTMLInputElement>(
      '[data-mobile-search-drawer="true"] input[data-testid="header-search-input"]',
    )

    if (!input) {
      return false
    }

    input.focus({ preventScroll: true })
    return document.activeElement === input
  }

  function handleSearchAction() {
    setIsSearchOpen(true)

    if (focusMobileSearchInput()) {
      setSearchFocusTrigger(0)
      return
    }

    setSearchFocusTrigger(prev => prev + 1)
  }

  function resetSearchDrawerInteractionState() {
    setSearchFocusTrigger(0)

    window.setTimeout(() => {
      const activeElement = document.activeElement

      if (activeElement instanceof HTMLElement) {
        activeElement.blur()
      }
    }, 0)
  }

  function handleSearchOpenChange(nextOpen: boolean) {
    setIsSearchOpen(nextOpen)

    if (nextOpen) {
      return
    }

    resetSearchDrawerInteractionState()
  }

  function handleSearchNavigate() {
    setIsSearchOpen(false)
    resetSearchDrawerInteractionState()
  }

  function handlePredictionResultsNavigate(href: Route) {
    setIsSearchOpen(false)
    resetSearchDrawerInteractionState()
    router.push(href)
  }

  async function handleInstallAction() {
    setIsGuestMenuOpen(false)

    if (isIos) {
      toast.info(t('Install app'), {
        duration: 10_000,
        description: (
          <PwaInstallIosInstructions className="max-w-sm pt-1" />
        ),
      })
      return
    }

    try {
      await requestInstall()
    }
    catch {
      toast.error(t('An unexpected error occurred. Please try again.'))
    }
  }

  function handleAuthAction() {
    setIsGuestMenuOpen(false)
    window.setTimeout(() => {
      void open()
    }, 120)
  }

  function handleHowItWorksAction() {
    setIsGuestMenuOpen(false)
    window.setTimeout(() => {
      setIsHowItWorksOpen(true)
    }, 120)
  }

  return (
    <>
      <div aria-hidden="true" className="lg:hidden" style={{ height: MOBILE_BOTTOM_NAV_OFFSET }} />

      {isHowItWorksOpen && (
        <div className="lg:hidden">
          <Suspense fallback={null}>
            <HowItWorks
              open={isHowItWorksOpen}
              onOpenChange={setIsHowItWorksOpen}
              hideTrigger
              displayMode="mobile"
            />
          </Suspense>
        </div>
      )}

      <Drawer
        open={isSearchOpen}
        onOpenChange={handleSearchOpenChange}
        fixed
        repositionInputs={false}
      >
        <DrawerContent
          data-mobile-search-drawer="true"
          className={cn(`
            h-[90dvh] max-h-dvh overflow-y-auto rounded-none border-x-0 border-b-0 border-border/70 bg-background px-4
            pt-2 pb-6
          `)}
        >
          <DrawerHeader className="sr-only p-0">
            <DrawerTitle>{t('Search')}</DrawerTitle>
          </DrawerHeader>
          <div className="mt-4">
            {isSearchOpen && (
              <Suspense fallback={null}>
                <HeaderSearch
                  onNavigate={handleSearchNavigate}
                  onPredictionResultsNavigate={handlePredictionResultsNavigate}
                  emptyState={<SearchDiscoveryContent onNavigate={handleSearchNavigate} />}
                  focusTrigger={searchFocusTrigger}
                />
              </Suspense>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {!isAuthenticated && (
        <Drawer open={isGuestMenuOpen} onOpenChange={setIsGuestMenuOpen}>
          <DrawerContent className="max-h-[88vh] rounded-t-[1.75rem] border-border/70 bg-background px-4 pt-2 pb-6">
            <div className="grid gap-4 pt-3">
              <div className="overflow-hidden rounded-2xl border border-border/70">
                {canShowInstallUi && (
                  <>
                    <button
                      type="button"
                      className={cn(`
                        flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold
                        disabled:pointer-events-none disabled:opacity-50
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold"
                    onClick={handleHowItWorksAction}
                  >
                    <InfoIcon className="size-4 text-primary" />
                    {t('How it works')}
                  </button>
                </DrawerClose>

                <div className="mx-4 h-px bg-border/70" />

                <DrawerClose asChild>
                  <AppLink
                    intentPrefetch
                    href="/docs"
                    className="flex items-center gap-3 px-4 py-3 text-sm font-semibold"
                  >
                    <BookOpenIcon className="size-4 text-muted-foreground" />
                    {t('Documentation')}
                  </AppLink>
                </DrawerClose>

                <div className="mx-4 h-px bg-border/70" />

                <DrawerClose asChild>
                  <AppLink
                    intentPrefetch
                    href="/tos"
                    className="flex items-center gap-3 px-4 py-3 text-sm font-semibold"
                  >
                    <FileTextIcon className="size-4 text-muted-foreground" />
                    {t('Terms of Use')}
                  </AppLink>
                </DrawerClose>
              </div>

              <DrawerClose asChild>
                <Button type="button" className="h-11 w-full" onClick={handleAuthAction}>
                  {t('Get Started')}
                </Button>
              </DrawerClose>
            </div>
          </DrawerContent>
        </Drawer>
      )}

      <nav
        className="fixed inset-x-0 z-40 lg:hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
        aria-label="Primary navigation"
      >
        <div className="mx-3 flex justify-center">
          <div
            className={cn(`
              flex w-full max-w-md items-center justify-between gap-1 rounded-full bg-primary p-1.5
              shadow-[0_12px_32px_-8px_rgba(0,0,0,0.35)]
            `)}
          >
            <MobileNavLink href="/" label={t('Home')} active={pathname === '/'} icon={HouseIcon} />
            <MobileNavButton label={t('Search')} active={isSearchOpen} onClick={handleSearchAction} icon={SearchIcon} />
            <MobileNavLink href="/new" label={t('New')} active={pathname === '/new'} icon={SparkleIcon} />
            {isAuthenticated
              ? (
                  <MobilePortfolioNavLink active={pathname.startsWith('/portfolio')} />
                )
              : (
                  <MobileNavButton
                    label={t('More')}
                    active={isGuestMenuOpen}
                    onClick={() => setIsGuestMenuOpen(true)}
                    icon={MenuIcon}
                  />
                )}
          </div>
        </div>
      </nav>
    </>
  )
}

/**
 * Shared chip-style nav item.
 * Inactive: icon-only on the yellow bar.
 * Active: rounded pill with a soft black-tint background, label slides in next to the icon.
 * All icons + labels are full-black so they read crisply on yellow.
 */
function navChipClassName(active: boolean) {
  return cn(
    `
      flex h-11 items-center justify-center rounded-full px-3 text-black transition-[background-color,flex-grow]
      duration-200 ease-out
      focus-visible:ring-2 focus-visible:ring-black/40 focus-visible:outline-none
      active:scale-[0.97]
    `,
    active ? 'flex-1 bg-black/15' : 'flex-none hover:bg-black/5',
  )
}

function NavChipContents({
  Icon,
  label,
  active,
}: {
  Icon: typeof HouseIcon
  label: ReactNode
  active: boolean
}) {
  return (
    <>
      <Icon className="size-5 shrink-0" strokeWidth={2.25} aria-hidden="true" />
      <span
        className={cn(
          'overflow-hidden text-sm leading-none font-semibold whitespace-nowrap transition-all duration-200 ease-out',
          active ? 'ml-2 max-w-32 opacity-100' : 'ml-0 max-w-0 opacity-0',
        )}
      >
        {label}
      </span>
    </>
  )
}

interface MobileNavLinkProps {
  active: boolean
  href: ComponentProps<typeof AppLink>['href']
  icon: typeof HouseIcon
  label: ReactNode
}

function MobileNavLink({ active, href, icon: Icon, label }: MobileNavLinkProps) {
  return (
    <AppLink
      intentPrefetch
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={typeof label === 'string' ? label : undefined}
      className={navChipClassName(active)}
    >
      <NavChipContents Icon={Icon} label={label} active={active} />
    </AppLink>
  )
}

function MobilePortfolioNavLink({ active }: { active: boolean }) {
  const t = useExtracted()
  return (
    <AppLink
      intentPrefetch
      href="/portfolio"
      aria-current={active ? 'page' : undefined}
      aria-label={t('Portfolio')}
      className={navChipClassName(active)}
    >
      <NavChipContents Icon={ChartLineIcon} label={t('Portfolio')} active={active} />
    </AppLink>
  )
}

interface MobileNavButtonProps {
  active: boolean
  icon: typeof HouseIcon
  label: string
  onClick: () => void
}

function MobileNavButton({ active, icon: Icon, label, onClick }: MobileNavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={navChipClassName(active)}
    >
      <NavChipContents Icon={Icon} label={label} active={active} />
    </button>
  )
}

interface MobileLocaleSwitcherProps {
  onLocaleChange?: () => void
}

function useEnabledLocalesFetch() {
  const [enabledLocales, setEnabledLocales] = useState<SupportedLocale[]>([...SUPPORTED_LOCALES])

  useEffect(function fetchEnabledLocalesOnMount() {
    let isActive = true

    async function loadEnabledLocales() {
      try {
        const response = await fetch('/api/locales')
        if (!response.ok) {
          return
        }

        const payload = await response.json()
        if (!isActive || !Array.isArray(payload?.locales)) {
          return
        }

        const normalized = normalizeEnabledLocales(payload.locales)
        if (normalized.length > 0) {
          setEnabledLocales(normalized)
        }
      }
      catch (error) {
        console.error('Failed to load enabled locales', error)
      }
    }

    void loadEnabledLocales()

    return function cancelEnabledLocalesFetch() {
      isActive = false
    }
  }, [])

  return enabledLocales
}

function useLocaleChangeHandler({
  locale,
  onLocaleChange,
}: {
  locale: SupportedLocale
  onLocaleChange: (() => void) | undefined
}) {
  const [isPending, setIsPending] = useState(false)

  function handleLocaleChange(nextLocale: SupportedLocale) {
    if (nextLocale === locale || typeof window === 'undefined') {
      return
    }

    const currentPathname = stripLocalePrefix(window.location.pathname)
    const targetPathname = withLocalePrefix(currentPathname, nextLocale)
    const targetUrl = `${targetPathname}${window.location.search}${window.location.hash}`

    onLocaleChange?.()
    setIsPending(true)
    window.location.replace(targetUrl)
  }

  return { isPending, handleLocaleChange }
}

function MobileLocaleSwitcher({ onLocaleChange }: MobileLocaleSwitcherProps) {
  const locale = useLocale() as SupportedLocale
  const enabledLocales = useEnabledLocalesFetch()
  const { isPending, handleLocaleChange } = useLocaleChangeHandler({ locale, onLocaleChange })

  return (
    <div className="rounded-2xl border border-border/70 px-4 py-3">
      <div className="mb-3 text-sm font-semibold">
        {LOOP_LABELS[locale] ?? 'Language'}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {enabledLocales.map(option => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={option === locale ? 'default' : 'outline'}
            className="justify-between"
            onClick={() => handleLocaleChange(option)}
            disabled={isPending}
          >
            <span>{LOCALE_LABELS[option] ?? option.toUpperCase()}</span>
            {option === locale && <CheckIcon className="size-4" />}
          </Button>
        ))}
      </div>
    </div>
  )
}
