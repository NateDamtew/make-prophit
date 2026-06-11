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
  },
}

export default config
