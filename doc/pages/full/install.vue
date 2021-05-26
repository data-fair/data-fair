<template>
  <div>
    <v-col class="mt-6 pt-6 text-center">
      <v-img
        height="160px"
        contain
        src="./logo.svg"
        class="my-6"
      />
      <h1 class="text-h3 grey--text text--darken-3">
        Data Fair
      </h1>
      <h4>
        Version {{ version }}
      </h4>
      <h1 class="text-h3 grey--text text--darken-3" style="margin-top:200px;">
        Installation et configuration
      </h1>
      <h4 style="margin-top:200px!important;">
        {{ new Date() | moment('DD MMMM YYYY') }}
      </h4>
    </v-col>
    <div class="page-break" />
    <h2 class="text-h4 my-4 grey--text text--darken-3">
      Table des matières
    </h2>
    <template v-for="(section, i) in sections">
      <h4 v-if="!section.meta.subsection" :key="'st-'+i">
        {{ section.meta.section }} - {{ section.meta.title }}
      </h4>
      <h5
        v-else
        :key="'st-'+i"
        class="ml-3"
      >
        {{ section.meta.section }}.{{ section.meta.subsection }} - {{ section.meta.title }}
      </h5>
    </template>
    <template v-for="(section, i) in sections">
      <div
        v-if="!section.meta.subsection"
        :key="'pb-'+i"
        class="page-break"
      />
      <h2
        v-if="!section.meta.subsection"
        :key="'t-'+i"
        class="text-h4 my-4 grey--text text--darken-3"
      >
        {{ section.meta.section }} - {{ section.meta.title }}
      </h2>
      <h3
        v-else
        :key="'t-'+i"
        class="text-h5 my-4 grey--text text--darken-3"
      >
        {{ section.meta.section }}.{{ section.meta.subsection }} - {{ section.meta.title }}
      </h3>
      <div
        :key="'c-'+i"
        class="article"
        v-html="section.html"
      />
    </template>
  </div>
</template>

<script>
  const marked = require('@hackmd/meta-marked')
  const context = require.context('../install/', true, /\.md$/)
  const version = require('../../../package.json').version

  const flatten = require('flat')
  // Webpack way of requiring a bunch of modules at once

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
    layout: 'void',
    data: () => ({
      version,
    }),
    computed: {
      sections() {
        if (!this.$route) return
        const sections = context.keys().filter(k => k.includes('-fr.md')).map(k => Object.assign(marked(context(k).default) || {}, { id: k.split('/')[1].split('.').shift().replace('-fr', '') }))
        sections.sort((s1, s2) => {
          if (s1.meta.section < s2.meta.section) return -1
          else if (s1.meta.section > s2.meta.section) return 1
          else {
            if (!s1.meta.subsection || s1.meta.subsection < s2.meta.subsection) return -1
            else return 1
          }
        })
        sections[1].html = sections[1].html.replace('{{CONFIG_VARS}}', this.configVars)
        sections[2].html = sections[2].html.replace('{{I18N_VARS}}', this.i18nVars)
        return sections
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
    mounted () {
      // Apply classes from vuetify to markdown generated HTML
      const elemClasses = {
        h2: ['headline', 'font-weight-bold', 'grey--text', 'text--darken-3', 'my-4'],
        h3: ['title', 'font-weight-bold', 'grey--text', 'text--darken-3', 'my-3'],
        h4: ['subheading', 'font-weight-bold', 'grey--text', 'text--darken-3', 'my-2'],
        p: ['body1'],
        table: ['v-datatable', 'v-table', 'theme--light', 'elevation-1'],
        code: ['theme--light'],
        'pre code': ['v-card', 'pt-3', 'mb-4'],
      }
      Object.keys(elemClasses).forEach(k => {
        this.$el.querySelectorAll(k).forEach(e => {
          elemClasses[k].forEach(c => e.classList.add(c))
        })
      })
      this.$el.querySelectorAll('img').forEach(img => {
        img.parentElement.classList.add('text-center')
      })
    },
  }
</script>

<style>
pre {
  white-space: pre-wrap;
}

code {

}

.article h2{
  margin-top: 24px;
  margin-bottom: 24px;
  font-size: 24px;
  font-weight: 400;
  line-height: 32px;
  font-family: 'Nunito';

}

.caption {
  width: 100%;
  text-align: center;
}

p img {
  max-width:80%;
  margin: 12px auto;
  border: solid;
  border-width: 1px;
}

.page-break{
  page-break-after: always;
}
</style>
