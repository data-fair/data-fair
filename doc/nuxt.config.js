const config = require('config')
const messages = require('../i18n').messages

module.exports = {
  srcDir: 'doc/',
  build: { extractCSS: true },
  generate: {
    dir: 'doc-dist'
  },
  loading: { color: '#1e88e5' }, // Customize the progress bar color
  plugins: [{ src: '~plugins/vuetify' }],
  router: { base: '/data-fair/' },
  env: { theme: config.theme },
  modules: ['@nuxtjs/markdownit', ['nuxt-i18n', {
    seo: false,
    locales: [
      { code: 'fr' },
      { code: 'en' }
    ],
    defaultLocale: 'fr',
    vueI18n: {
      fallbackLocale: 'fr',
      messages
    }
  }]],
  head: {
    title: 'DataFair',
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
