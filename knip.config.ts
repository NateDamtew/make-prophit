import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  ignore: [
    'docs.config.ts',
    'public/**/*',
    'src/components/ui/**',
    '.husky/**',
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
