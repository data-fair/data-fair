<template lang="html">
  <doc-page :content="content" />
</template>

<script>
  import DocPage from '../../components/DocPage'

  const flatten = require('flat')
  // Webpack way of requiring a bunch of modules at once
  const context = require.context('.', true, /\.md$/)

  // Used to flatten var definitions from custom-environment-variables.js
  const defaults = Object.assign({}, require('../../../config/default.js'), require('../../../config/production.js'))
  function flattenVars(vars, flatVars = [], prefix = '') {
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
  function escapeHtml(unsafe) {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  export default {
    components: { DocPage },
    data: () => ({
      pages: ['install', 'config', 'i18n'],
    }),
    computed: {
      content() {
        if (!this.$route) return
        const content = context(`./${this.$route.params.id}-${this.$i18n.locale}.md`) || context(`./${this.$route.params.id}-fr.md`)
        return content.default.replace('{{I18N_VARS}}', this.i18nVars).replace('{{CONFIG_VARS}}', this.configVars)
      },
      configVars() {
        let table = `<table><thead><tr><th>${this.$t('pages.install.config.varKey')}</th><th>${this.$t('pages.install.config.varName')}</th><th>${this.$t('pages.install.config.varDesc')}</th><th>${this.$t('pages.install.config.varDefault')}</th></tr></thead><tbody>\n`
        customEnvVars.forEach(v => {
          const description = this.$te('pages.install.config.varDescriptions.' + v.key) ? this.$t('pages.install.config.varDescriptions.' + v.key) : ''
          table += `<tr><td>${v.key}</td><td>${v.name}</td><td>${description}</td><td>${v.def}</td></tr>\n`
        })
        table += '</tbody></table>'
        return table
      },
      i18nVars() {
        const flatMessages = flatten(this.$i18n.messages[this.$i18n.locale], { delimiter: '_' })
        let table = `<table><thead><tr><th>${this.$t('pages.install.i18n.i18nKey')}</th><th>${this.$t('pages.install.i18n.i18nVar')}</th><th>${this.$t('pages.install.i18n.i18nVal')}</th></tr></thead><tbody>\n`
        table += Object.keys(flatMessages)
          .filter(k => k.indexOf('doc_') !== 0)
          .map(k => `<tr><td>${k.replace(/_/g, '.')}</td><td>I18N_${this.$i18n.locale}_${k}</td><td><pre>${escapeHtml((typeof flatMessages[k] === 'string') ? flatMessages[k] : 'MISSING')}</pre></td></tr>`)
          .join('\n')
        table += '</tbody></table>'
        return table
      },
    },
  }
</script>
