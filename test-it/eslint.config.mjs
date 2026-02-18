import neostandard from 'neostandard'
import dfLibRecommended from '@data-fair/lib-utils/eslint/recommended.js'
import mochaPlugin from 'eslint-plugin-mocha'

export default [
  { ignores: ['node_modules/*', 'data/*'] },
  ...dfLibRecommended,
  ...neostandard({ ts: true }),
  mochaPlugin.configs.recommended,
  {
    rules: {
      'mocha/no-pending-tests': 'off'
    }
  }
]
