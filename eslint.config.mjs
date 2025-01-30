import neostandard from 'neostandard'
import dfLibRecommended from '@data-fair/lib-utils/eslint/recommended.js'

export default [
  { ignores: ['ui/*', '**/.type/', 'dev/*', 'node_modules/*', 'test/*'] },
  ...dfLibRecommended,
  ...neostandard({ ts: true })
]
