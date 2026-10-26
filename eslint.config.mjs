import neostandard from 'neostandard'
import dfLibRecommended from '@data-fair/lib-utils/eslint/recommended.js'

export default [
  { ignores: ['ui/', '**/.type/', 'data/', 'dev/', 'docs/', 'parquet-writer/', 'benchmark/.cache/', '**/*.peg.js', '**/*.d.ts', 'agent-tools/**/*.js', '.claude/'] },
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
