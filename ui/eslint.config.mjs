import neostandard from 'neostandard'
import pluginVue from 'eslint-plugin-vue'
import pluginVuetify from 'eslint-plugin-vuetify'
import dfLibRecommended from '@data-fair/lib-utils/eslint/recommended.js'

// eslint-plugin-vuetify's flat/base already registers the `vue` plugin, and
// ESLint 9.39+ rejects redefining a plugin — strip `plugins` from vue's flat config.
const vueFlatRecommended = pluginVue.configs['flat/recommended'].map(({ plugins, ...rest }) => rest)

export default [
  ...dfLibRecommended,
  ...vueFlatRecommended,
  ...pluginVuetify.configs['flat/recommended'],
  ...neostandard({ ts: true }),
  {
    rules: {
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
      'no-undef': 'off' // typescript takes care of this with autoImport support
    }
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: '@typescript-eslint/parser'
      }
    }
  },
  { ignores: ['dist/*', 'dts/*', 'src/components/vjsf/*'] },
]
