<template lang="html">
  <doc-page
    :content="content"
    :only-english="true"
  />
</template>

<script>
import DocPage from '../../components/DocPage'
const flatten = require('flat')

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

const varDescriptions = flatten({
  mode: 'Use this parameter to run both the Web server and the dataset processing loop or run them separately. Pissible values: "server_worker", "server", "worker".',
  publicUrl: '<b>IMPORTANT.</b> The URL where the server will be exposed. For example https://koumoul.com/s/data-fair',
  wsPublicUrl: '<b>IMPORTANT.</b> The URL where the Web socket server will be exposed. For example wss://koumoul.com/s/data-fair',
  directoryUrl: '<b>IMPORTANT.</b> The URL where the user management service will be exposed. For example https://koumoul.com/s/simple-directory',
  mongoUrl: 'The full connexion chain to the mongodb database.',
  analytics: 'JSON configuration of analytics, matches the "modules" part of the configuration for this library <a href="https://github.com/koumoul-dev/vue-multianalytics#modules">vue-multianalytics</a>',
  elasticsearch: {
    maxBulkLines: 'Maximum number of lines when sending indexing in bulk into ElasticSearch.',
    maxBulkChars: 'Maximum number of chars when sending indexing in bulk into ElasticSearch.'
  },
  defaultRemoteKey: {
    value: 'Default API key to use when calling remote services.'
  },
  brand: {
    logo: 'A link to an image with your logo.',
    title: 'The name of your organization or another name for the service.',
    url: 'A link to use on the top left logo.'
  },
  worker: {
    concurrency: 'Number of tasks processes in parallel. Tasks are all asynchronous processings on datasets (file format analysis, indexing, extending, etc.)'
  },
  i18n: {
    locales: 'List of locales split by commas'
  }
})

export default {
  components: { DocPage },
  computed: {
    content () {
      if (!this.$route) return
      const content = context(`./${this.$route.params.id}.md`) || context(`./${this.$route.params.id}.md`)
      return content.default.replace('{{CONFIG_VARS}}', this.configVars).replace(/{{DOC_BASE}}/g, this.$router.options.base)
    },
    configVars () {
      let table = '<table><thead><tr><th>Key in config file</th><th>Env variable</th><th>Description</th><th>Default value</th></tr></thead><tbody>\n'
      customEnvVars.forEach(v => {
        const description = varDescriptions[v.key] || ''
        table += `<tr><td>${v.key}</td><td>${v.name}</td><td>${description}</td><td>${v.def}</td></tr>\n`
      })
      table += '</tbody></table>'
      return table
    }
  }
}
</script>
