import neostandard from 'neostandard'
import dfLibRecommended from '@data-fair/lib-utils/eslint/recommended.js'

export default [
  { ignores: ['ui-legacy/*', 'ui/*', '**/.type/', 'dev/*', 'node_modules/*', 'doc/*', '**/*.peg.js', '**/*.d.ts', 'parquet_writer/*', 'agent-tools/**/*.js'] },
  ...dfLibRecommended,
  ...neostandard({ ts: true }),
  {
    // Target the specific folder
    files: ['tests/**/*.ts'],
    rules: {
      'no-empty-pattern': 'off'
    }
  }
]
