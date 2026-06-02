import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  ignore: [
    'docs.config.ts',
    'public/**/*',
    'src/components/ui/**',
    '.husky/**',
    // Drizzle schema files are consumed via `import * as schema from './db/schema'`.
    // Knip cannot trace through wildcard re-exports so all named relation/table exports
    // appear "unused". Ignore the whole schema directory to suppress false positives.
    'src/lib/db/schema/**',
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
