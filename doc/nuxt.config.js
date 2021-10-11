const config = require('config')
const dir = require('node-dir')

// Additional dynamic routes for generate
const routes = dir.files('doc/pages/', { sync: true })
  .filter(f => f.endsWith('.md'))
  .map(f => {
    f = f.replace('.md', '').replace('doc/pages/', '')
    const dashInd = f.lastIndexOf('-')
    const key = f.slice(0, dashInd)
    const lang = f.slice(dashInd + 1, f.length)
    return lang === 'fr' ? `/${key}` : `/${lang}/${key}`
  })

module.exports = {
  srcDir: 'doc/',
  target: 'static',
  build: {
    extractCSS: true,
    extend (config, ctx) {
        config.module.rules.push({
          enforce: 'pre',
          test: /\.md$/,
          loader: 'raw-loader',
          exclude: /(node_modules)/,
        })
      },
   },
  generate: {
    dir: 'doc-dist',
    routes,
  },
  loading: { color: '#1e88e5' }, // Customize the progress bar color
  router: { base: process.env.DOC_BASE || '/' },
  env: {
    theme: config.theme,
    publicUrl: config.publicUrl,
  },
  plugins: [
    { src: '~plugins/moment' },
  ],
  modules: [['@nuxtjs/i18n', {
    seo: false,
    locales: [
      { code: 'fr' },
      { code: 'en' },
    ],
    defaultLocale: 'fr',
    vueI18nLoader: true,
    vueI18n: {
      fallbackLocale: 'fr',
    },
  }]],
  buildModules: ['@nuxtjs/vuetify'],
  vuetify: {
    theme: {
      themes: {
        light: config.theme.colors,
      },
    },
    defaultAssets: {
      font: {
        family: 'Nunito',
      },
    },
  },
  head: {
    title: 'Data Fair',
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'application', name: 'application-name', content: 'DataFair' },
      { hid: 'description', name: 'description', content: 'DataFair - Documentation' },
    ],
    link: [
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css?family=Nunito:300,400,500,700,400italic|Material+Icons' },
      { rel: 'icon', type: 'image/x-icon', href: 'favicon.ico' },
    ],
  },
}
