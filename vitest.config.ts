import path from 'node:path'
import { defineConfig } from 'vitest/config'

const domTestFiles = [
  'tests/unit/**/*.test.tsx',
  'tests/unit/AppKitProvider.test.ts',
  'tests/unit/adminEventsHideCryptoPreference.test.ts',
  'tests/unit/authClient.test.ts',
  'tests/unit/customJavascriptCode.test.ts',
  'tests/unit/eventTrades.test.ts',
  'tests/unit/sideCardImageClient.test.ts',
  'tests/unit/theme.test.ts',
  'tests/unit/themeSettingsSocialLinks.test.ts',
  'tests/unit/useNotifications.test.ts',
  'tests/unit/useSearch.test.ts',
  'tests/unit/utilsConfetti.test.ts',
  'tests/unit/viemNetwork.test.ts',
  'tests/unit/websocketReconnect.test.ts',
]

export default defineConfig({
  test: {
    expect: {
      requireAssertions: true,
    },
    silent: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    // Limit concurrency to prevent worker-pool exhaustion in constrained
    // environments (pre-push hook, CI). Without a cap, 150+ fork workers
    // all compete for memory and exceed startup timeouts.
    // (poolOptions was removed in Vitest 4 — these are now top-level)
    maxWorkers: 8,
    // next-intl's ESM build imports `next/navigation` without an extension, which
    // Node's strict ESM loader rejects when the dep is externalized. Inlining it
    // lets Vite resolve the specifier.
    server: {
      deps: {
        inline: ['next-intl'],
      },
    },
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      'server-only': path.resolve(import.meta.dirname, './tests/empty-module.ts'),
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          globals: true,
          setupFiles: ['./vitest.setup.ts'],
          include: ['tests/unit/**/*.test.ts'],
          exclude: domTestFiles.slice(1),
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./vitest.setup.dom.ts'],
          include: domTestFiles,
        },
      },
    ],
  },
})
