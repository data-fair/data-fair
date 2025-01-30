import neostandard from 'neostandard'
import dfLibRecommended from '@data-fair/lib-utils/eslint/recommended.js'

export default [
  { ignores: ['ui/*', '**/.type/', 'dev/*', 'node_modules/*', 'test/*', 'doc/*'] },
  ...dfLibRecommended,
  ...neostandard({ ts: true })
]
