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
        return sections
      },
      configVars() {
        let table = `<table><thead><tr><th>${this.$t('varKey')}</th><th>${this.$t('varName')}</th><th>${this.$t('varDesc')}</th><th>${this.$t('varDefault')}</th></tr></thead><tbody>\n`
        customEnvVars.forEach(v => {
          const description = this.$te('varDescriptions.' + v.key) ? this.$t('varDescriptions.' + v.key) : ''
          table += `<tr><td>${v.key}</td><td>${v.name}</td><td>${description}</td><td>${v.def}</td></tr>\n`
        })
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

<i18n src="../../i18n/config-fr.json" locale="fr"></i18n>

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
