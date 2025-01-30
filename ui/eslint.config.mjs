import neostandard from 'neostandard'
import pluginVue from 'eslint-plugin-vue'

export default [
  ...pluginVue.configs['flat/vue2-recommended'],
  ...neostandard(),
  {
    rules: {
      'vue/no-v-html': 'off',
      'vue/multi-word-component-names': 'off',
      'node/no-deprecated-api': 'off',
      'vue/no-mutating-props': 'off',
      'vue/require-prop-types': 'off',
      'vue/no-useless-template-attributes': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/valid-v-slot': 'off',
      'vue/no-v-text-v-html-on-component': 'off'
    }
  },
  { ignores: ['nuxt-dist/*', 'node_modules/*'] },
]
