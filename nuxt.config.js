const config = require('config')
const URL = require('url').URL
const webpack = require('webpack')
const i18n = require('./i18n')
const VuetifyLoaderPlugin = require('vuetify-loader/lib/plugin')

module.exports = {
  srcDir: 'public/',
  build: {
    // cache: true,
    publicPath: config.publicUrl + '/_nuxt/',
    transpile: ['vuetify', /@koumoul/], // Necessary for "à la carte" import of vuetify components
    extend (config, { isServer, isDev, isClient }) {
      // Ignore all locale files of moment.js, those we want are loaded in plugins/moment.js
      config.plugins.push(new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/))
      config.plugins.push(new VuetifyLoaderPlugin())
    }
  },
  loading: { color: '#1e88e5' }, // Customize the progress bar color
  plugins: [
    { src: '~plugins/ws', ssr: false },
    { src: '~plugins/session', ssr: false },
    { src: '~plugins/vuetify' },
    { src: '~plugins/moment' },
    { src: '~plugins/truncate' },
    { src: '~plugins/logger', ssr: false },
    { src: '~plugins/analytics', ssr: false }
  ],
  router: {
    base: new URL(config.publicUrl + '/').pathname
  },
  modules: ['@digibytes/markdownit', '@nuxtjs/axios', 'cookie-universal-nuxt', ['nuxt-i18n', {
    seo: false,
    locales: i18n.locales,
    defaultLocale: config.i18n.defaultLocale,
    vueI18n: {
      fallbackLocale: config.i18n.defaultLocale,
      messages: i18n.messages
    }
  }]],
  axios: {
    browserBaseURL: config.publicUrl + '/',
    baseURL: `http://localhost:${config.port}/`
  },
  env: {
    publicUrl: config.publicUrl,
    wsPublicUrl: config.wsPublicUrl,
    directoryUrl: config.directoryUrl,
    adminRole: config.adminRole,
    map: config.map,
    brand: config.brand,
    openapiViewerUrl: config.openapiViewerUrl,
    browserLogLevel: config.browserLogLevel,
    analytics: config.analytics,
    captureUrl: config.captureUrl
  },
  head: {
    title: config.brand.title,
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'application', name: 'application-name', content: config.brand.title },
      { hid: 'description', name: 'description', content: config.brand.description },
      { hid: 'robots', name: 'robots', content: 'noindex' }
    ],
    link: [
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css?family=Nunito:300,400,500,700,400italic' }
    ]
  }
}
