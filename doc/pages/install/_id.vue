<template lang="html">
  <doc-page :content="content" />
</template>

<script>
import DocPage from '../../components/DocPage'

// Webpack way of requiring a bunch of modules at once
const context = require.context('.', true, /\.md$/)

// Used to flatten var definitions from custom-environment-variables.js
const defaults = Object.assign({}, require('../../../config/default.js'), require('../../../config/production.js'))
function flattenVars (vars, flatVars = [], prefix = '') {
  Object.keys(vars).forEach(v => {
    const key = prefix + v
    let def = key.split('.').reduce((a, k) => { return a[k] }, defaults)
    if (typeof def === 'object') def = JSON.stringify(def)
    if (typeof vars[v] === 'string') flatVars.push({ key, name: vars[v], def })
    else if (typeof vars[v] === 'object' && vars[v].__name) flatVars.push({ key, name: vars[v].__name, def })
    else flattenVars(vars[v], flatVars, prefix + v + '.')
  })
  return flatVars
}
const customEnvVars = flattenVars(require('../../../config/custom-environment-variables'))

export default {
  components: { DocPage },
  computed: {
    content () {
      if (!this.$route) return
      const content = context(`./${this.$route.params.id}.md`) || context(`./${this.$route.params.id}.md`)
      return content.default.replace('{{CONFIG_VARS}}', this.configVars)
    },
    configVars () {
      let table = `<table><thead><tr><th>${this.$t('varKey')}</th><th>${this.$t('varName')}</th><th>${this.$t('varDesc')}</th><th>${this.$t('varDefault')}</th></tr></thead><tbody>\n`
      customEnvVars.forEach(v => {
        const description = this.$te('varDescriptions.' + v.key) ? this.$t('varDescriptions.' + v.key) : ''
        table += `<tr><td>${v.key}</td><td>${v.name}</td><td>${description}</td><td>${v.def}</td></tr>\n`
      })
      table += '</tbody></table>'
      return table
    }
  }
}
</script>

<i18n src="../../i18n/config-fr.json" locale="fr"></i18n>
