import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/unit/*.test.{ts,tsx}'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Limit concurrency to prevent worker-pool exhaustion in constrained
    // environments (pre-push hook, CI). Without a cap, 150+ fork workers
    // all compete for memory and exceed startup timeouts.
    poolOptions: {
      forks: {
        maxForks: 8,
      },
    },
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './tests/empty-module.ts'),
    },
  },
})
