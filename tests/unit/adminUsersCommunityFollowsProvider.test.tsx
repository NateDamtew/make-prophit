import type { ReactNode } from 'react'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, mock } from 'bun:test'

void mock.module('next/cache', () => ({ cacheLife: mock(), cacheTag: mock() }))

void mock.module('@/app/[locale]/(platform)/_components/PlatformViewerState', () => ({ default: () => null }))
void mock.module('@/app/[locale]/admin/_components/AdminHeader', () => ({ default: () => null }))
void mock.module('@/app/[locale]/admin/_components/AdminOnboardingSupportWidget', () => ({ default: () => null }))
void mock.module('@/app/[locale]/admin/_components/AdminSidebar', () => ({ default: () => null }))
void mock.module('@/app/[locale]/admin/_components/CopyVersion', () => ({ default: () => null }))
// FORK: the redesigned admin shell's providers use the app router; pass-through here.
void mock.module('@/components/admin-ui/shell/SidebarProvider', () => ({
  AdminSidebarProvider: ({ children }: { children: ReactNode }) => children,
}))
void mock.module('@/components/admin-ui/CommandPalette', () => ({
  AdminCommandProvider: ({ children }: { children: ReactNode }) => children,
}))
void mock.module('@/lib/admin-support-settings', () => ({
  getCompletedAdminOnboardingTasks: mock(() => []),
  getKuestSupportSettings: mock(() => ({ enabled: false, position: 'bottom-right' })),
  getSupportAnnouncementDismissedAt: mock(() => null),
}))
void mock.module('@/lib/db/queries/settings', () => ({
  SettingsRepository: { getSettings: mock(async () => ({ data: {} })) },
}))
void mock.module('@/providers/AppKitProvider', () => ({
  default: ({ children }: { children: ReactNode }) => <div data-testid="app-kit-provider">{children}</div>,
}))
void mock.module('@/providers/CommunityFollowsProvider', () => ({
  CommunityFollowsProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="community-follows-provider">{children}</div>
  ),
}))

const { default: AdminLayout } = await import('@/app/[locale]/admin/layout')

describe('admin users community follows provider', () => {
  it('renders admin page content inside the community follows provider', async () => {
    const layout = await AdminLayout({
      params: Promise.resolve({ locale: 'en' }),
      children: <div>Admin users content</div>,
    })

    render(layout)

    expect(screen.getByTestId('community-follows-provider')).toContainElement(screen.getByText('Admin users content'))
    expect(screen.getByTestId('app-kit-provider')).toContainElement(screen.getByTestId('community-follows-provider'))
  })
})
