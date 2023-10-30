const config = require('config')
const dir = require('node-dir')
const fs = require('fs')
const metaMarked = require('@hackmd/meta-marked')

// Additional dynamic routes for generate
const langs = ['fr', 'en']
const paths = dir.files('doc/pages/', { sync: true })
  .filter(f => f.endsWith('.md'))
  .filter(f => {
    const markdown = metaMarked(fs.readFileSync(f, 'utf8'))
    return markdown.meta.published !== false
  })
  .map(f => {
    let path = f.replace('.md', '').replace('doc/pages/', '')
    for (const lang of langs) path = path.replace(new RegExp(`-${lang}$`), '')
    return path
  })
const routes = []
for (const path of [...new Set(paths)]) {
  for (const lang of langs) {
    if (lang === 'fr') routes.push(path)
    else routes.push(`/${lang}/${path}`)
  }
}

const targetURL = new URL(process.env.TARGET || 'http://localhost:3144/')

module.exports = {
  telemetry: false,
  ssr: true,
  srcDir: 'doc/',
  target: 'static',
  components: true,
  build: {
    extractCSS: true,
    transpile: ['mermaid'],
    extend (config, ctx) {
      config.module.rules.push({
        enforce: 'pre',
        test: /\.md$/,
        loader: 'raw-loader',
        exclude: /(node_modules)/
      })
    }
  },
  generate: {
    dir: 'doc-dist',
    routes
  },
  loading: { color: '#1e88e5' }, // Customize the progress bar color
  router: { base: targetURL.pathname },
  env: {
    base: targetURL.pathname,
    theme: config.theme,
    hideDraft: (process.env.HIDE_DRAFT === 'true') || (process.env.GITHUB_REF_NAME && process.env.GITHUB_REF_NAME !== 'master')
  },
  plugins: [
    // { src: '~plugins/mermaid', ssr: false },
    { src: '~plugins/moment' }
  ],
  modules: [
    '@nuxtjs/sitemap',
    ['@nuxtjs/i18n', {
      seo: true,
      locales: ['fr', 'en'],
      defaultLocale: 'fr',
      vueI18nLoader: true,
      vueI18n: {
        fallbackLocale: 'fr'
      }
    }]
  ],
  sitemap: {
    hostname: targetURL.origin
  },
  buildModules: ['@nuxtjs/vuetify'],
  vuetify: {
    theme: {
      themes: {
        light: {
          primary: '#1976D2' // blue.darken2
        }
      }
    },
    defaultAssets: {
      font: {
        family: 'Nunito'
      }
    }
  },
  head: {
    title: 'Data Fair - Documentation',
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'application', name: 'application-name', content: 'DataFair' },
      { hid: 'description', name: 'description', content: 'DataFair - Documentation' }
    ],
    link: [
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css?family=Nunito:300,400,500,700,400italic|Material+Icons' },
      { rel: 'icon', type: 'image/x-icon', href: 'favicon.ico' }
    ]
  }
}
