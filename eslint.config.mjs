import neostandard from 'neostandard'
import dfLibRecommended from '@data-fair/lib-utils/eslint/recommended.js'

export default [
  { ignores: ['next-ui/*', 'ui/*', '**/.type/', 'dev/*', 'node_modules/*', 'test/*', 'doc/*', '**/*.peg.js', '**/*.d.ts'] },
  ...dfLibRecommended,
  ...neostandard({ ts: true })
]
