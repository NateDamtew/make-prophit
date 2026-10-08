import type { NextConfig } from 'next'

import { withSentryConfig } from '@sentry/nextjs'
import { createMDX } from 'fumadocs-mdx/next'
import createNextIntlPlugin from 'next-intl/plugin'

import { resolveCommitSha } from '@/lib/git'
import { getOptimizedImageHostPatterns } from '@/lib/image/image-optimization'

const optimizedImageHostPatterns = getOptimizedImageHostPatterns(process.env)
const commitSha = resolveCommitSha()

const config: NextConfig = {
  output: process.env.VERCEL_ENV ? undefined : 'standalone',
  deploymentId: process.env.VERCEL_ENV ? undefined : commitSha,
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  // Skip the build-time `tsc` pass. It needs 2-4GB and thrashes into a 20-30min
  // near-hang on memory-constrained Vercel Hobby build containers (the compile
  // itself finishes in ~5min). Type safety is enforced BEFORE every push via a
  // local `tsc --noEmit` + full `next build`, so re-checking on Vercel is pure
  // redundant cost. Re-enable if CI/pre-push type-checking is ever dropped.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Force the Dynamic SDK packages through the app's bundling pipeline so their
  // internal React contexts (e.g. DynamicWidgetContext) are a single shared
  // instance. Without this, production-only barrel/scope-hoist optimization can
  // instantiate the context twice, so a provider sets one instance while a
  // consumer reads another → "Hook must be used within <DynamicWidgetContextProvider>".
  transpilePackages: [
    '@dynamic-labs/sdk-react-core',
    '@dynamic-labs/ethereum',
    '@dynamic-labs/wagmi-connector',
    '@dynamic-labs/wallet-connector-core',
  ],
  reactStrictMode: false,
  reactCompiler: true,
  compress: false,
  experimental: {
    inlineCss: true,
    serverActions: {
      bodySizeLimit: '2mb',
    },
    typedEnv: true,
    turbopackRustReactCompiler: true,
    // Upstream enables turbopackFileSystemCacheForBuild + useTypeScriptCli.
    // Both are disabled here: together they SIGKILL'd the Vercel build with an
    // OOM on 2026-08-02 (the fork generates 520+ static pages, and the build
    // container has less headroom than upstream's).
    //   - turbopackFileSystemCacheForBuild trades memory for rebuild speed,
    //     which buys a cold Vercel container nothing.
    //   - useTypeScriptCli spawns the TS CLI type-checker, which this fork
    //     already opts out of via `typescript.ignoreBuildErrors` above —
    //     type safety is enforced at the pre-push gate instead.
    // Re-test both if the build container ever gets more memory.
    turbopackFileSystemCacheForBuild: false,
  },
  images: {
    unoptimized: process.env.DISABLE_IMAGE_OPTIMIZATION === 'true',
    loader: 'custom',
    loaderFile: './src/lib/image/image-loader.ts',
    deviceSizes: [256, 384, 640, 768],
    imageSizes: [16, 20, 24, 32, 36, 40, 42, 44, 48, 56, 64, 96, 128],
    remotePatterns: optimizedImageHostPatterns.map((hostname) => ({
      protocol: 'https',
      hostname,
      port: '',
      pathname: '/**',
    })),
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ]
  },
  async redirects() {
    return [
      {
        source: '/docs/my-account/affiliate-program',
        destination: '/docs/my-account/rewards',
        permanent: true,
      },
      {
        source: '/docs/my-account/affiliate-program.md',
        destination: '/docs/my-account/rewards.md',
        permanent: true,
      },
      {
        source: '/:locale/docs/my-account/affiliate-program',
        destination: '/:locale/docs/my-account/rewards',
        permanent: true,
      },
      {
        source: '/:locale/docs/my-account/affiliate-program.md',
        destination: '/:locale/docs/my-account/rewards.md',
        permanent: true,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/docs/:path*.md',
        destination: '/llms.md/:path*',
      },
      {
        source: '/:locale/docs/:path*.md',
        destination: '/llms.md/:path*',
      },
      {
        source: '/sitemaps/:id.xml',
        destination: '/sitemaps/sitemap/:id.xml',
      },
      {
        source: '/@:username',
        destination: '/profile/:username',
      },
      {
        source: '/:locale/@:username',
        destination: '/:locale/profile/:username',
      },
    ]
  },
  env: {
    COMMIT_SHA: commitSha,
  },
}

const withMDX = createMDX({
  configPath: 'docs.config.ts',
})

const withNextIntl = createNextIntlPlugin({
  experimental: {
    extract: true,
    srcPath: './src',
    messages: {
      path: './src/i18n/messages',
      format: 'json',
      locales: 'infer',
      sourceLocale: 'en',
    },
  },
})

export default withSentryConfig(withNextIntl(withMDX(config)), {
  telemetry: false,
  silent: true,
})
