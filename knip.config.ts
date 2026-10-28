import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  ignore: [
    'docs.config.ts',
    'docs/**',
    'public/**/*',
    'scripts/**',
    'src/lib/db/schema/**',
    'src/components/ui/**',
    '.husky/**',
    // Drizzle schema files are consumed via `import * as schema from './db/schema'`.
    // Knip cannot trace through wildcard re-exports so all named relation/table exports
    // appear "unused". Ignore the whole schema directory to suppress false positives.
    'src/lib/db/schema/**',
    // Upstream's wallet-signed SDK API-key UI. We redirect /settings/sdks to
    // our consolidated /settings/agents hub, leaving this component unrendered.
    // Kept in-tree so it can be wired into the agents hub later without
    // re-pulling the upstream commit.
    'src/app/[locale]/(platform)/settings/_components/SettingsSdkApiKeysContent.tsx',
    // Sibling of the above — the SDK market-maker downloads panel, unrendered
    // for the same reason (SDK settings routed to the agents hub).
    'src/app/[locale]/(platform)/settings/_components/SettingsSdkMarketMakerDownloadsContent.tsx',
    // Rhino TON-rail bridge modules. getRhinoConfig/commitQuote/RHINO_CHAIN etc.
    // are live (ton-deposit/ton-withdrawal actions), but getBridgeStatus +
    // RHINO_API_BASE are parked exports for the dormant TON bridge-status
    // feature — kept for the future native-TMA project.
    'src/lib/rhino/client.ts',
    'src/lib/rhino/constants.ts',
    // Local-payments rail (fork, LOCAL-PAYMENTS-DESIGN.md). The house-trading
    // module ships server-side first; its order-panel surface lands in a later
    // phase, so these exports have no UI importer yet. Constants/types in the
    // pawaPay client are the full documented API surface.
    'src/lib/house/**',
    'src/lib/pawapay/constants.ts',
    'src/lib/pawapay/types.ts',
    'src/app/[locale]/(platform)/_actions/ledger-order.ts',
    // Communities v1 shared library (notes/COMMUNITIES-CONCEPT.md). These
    // pieces ship with the component sheet (step 1) and get their first
    // consumer in a later step; drop each ignore in the step that uses it.
    'src/components/communities/cards/MarketCardSkeleton.tsx', // step 8: embed / overlay loading
    // Upstream's arbitrage second-wallet reconnect hook. Its mount point was
    // upstream's Reown AppKitProvider; our Dynamic provider doesn't mount it
    // (multi-wallet arb is inert under Dynamic). Kept for future syncs.
    'src/hooks/usePolymarketWalletConnection.ts',
    // Local scratch area, never committed.
    'scratch/**',
    // Upstream's wagmi cookie-SSR storage plumbing. Our Dynamic provider
    // mounts client-only and doesn't hydrate wagmi state from cookies, so the
    // app no longer imports these; kept in-tree for future upstream syncs.
    'src/lib/wagmi-storage.ts',
    'src/lib/wagmi-storage.server.ts',
  ],
  ignoreDependencies: ['lint-staged'],
  ignoreBinaries: ['lint-staged'],
  treatConfigHintsAsErrors: false,
  rules: {
    unlisted: 'off',
    // Some exported types are only consumed by the temporarily-ignored preset
    // files above, so they surface as "unused" until those layouts return.
    types: 'off',
  },
}

export default config
