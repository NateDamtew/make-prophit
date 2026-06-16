import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  ignore: [
    'docs.config.ts',
    'public/**/*',
    'scripts/**',
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
    // Community layout pieces that are temporarily unrendered while only the
    // Classic preset is active. Classic now ships its own hero/cards/tabs
    // (the `classic/` dir + self-contained ClassicPreset), so the generic
    // header, the old tab host, and the paused Newsroom/Sports/Forum presets
    // have no live importer. All kept in-tree to be restored when the other
    // layouts are re-enabled.
    'src/app/[locale]/(platform)/community/[slug]/_components/CommunityHeader.tsx',
    'src/app/[locale]/(platform)/community/[slug]/_components/CommunityTabs.tsx',
    'src/app/[locale]/(platform)/community/[slug]/_components/CommunityMarketCard.tsx',
    'src/app/[locale]/(platform)/community/[slug]/_components/community-tabs/MarketsTab.tsx',
    'src/app/[locale]/(platform)/community/[slug]/_components/presets/NewsroomPreset.tsx',
    'src/app/[locale]/(platform)/community/[slug]/_components/presets/SportsPreset.tsx',
    'src/app/[locale]/(platform)/community/[slug]/_components/presets/ForumPreset.tsx',
    // Header-only ticker; its sole consumer (CommunityHeader) is paused above.
    'src/components/community-engagement/ActivityTicker.tsx',
  ],
  ignoreDependencies: [
    'lint-staged',
  ],
  ignoreBinaries: [
    'lint-staged',
  ],
  treatConfigHintsAsErrors: false,
  rules: {
    unlisted: 'off',
    // Some exported types are only consumed by the temporarily-ignored preset
    // files above, so they surface as "unused" until those layouts return.
    types: 'off',
  },
}

export default config
