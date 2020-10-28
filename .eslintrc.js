module.exports = {
  root: true,
  extends: 'vuetify',
  plugins: ['no-only-tests'],
  rules: {
    // This rule is required because atom vue-format package remove the space
    'space-before-function-paren': 0,
    // TODO: we need to remove the following rules and fix the resulting errors on of these days
    'node/no-deprecated-api': 'off',
    'vue/require-prop-types': 'off',
    'vue/max-attributes-per-line': ['error', {
      'singleline': 2,
      'multiline': {
        'max': 1,
        'allowFirstLine': false
      }
    }],
    'no-only-tests/no-only-tests': 'error'
  },
}
