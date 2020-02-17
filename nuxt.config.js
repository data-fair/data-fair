const URL = require('url').URL
const i18n = require('./i18n')
let config = require('config')
config.basePath = new URL(config.publicUrl + '/').pathname
config.i18nMessages = i18n.messages

if (process.env.NODE_ENV === 'production') {
  const nuxtConfigInject = require('@koumoul/nuxt-config-inject')
  if (process.argv.slice(-1)[0] === 'build') config = nuxtConfigInject.prepare(config)
  else nuxtConfigInject.replace(config, ['nuxt-dist/**/*', 'public/static/**/*'])
}

const webpack = require('webpack')
const VuetifyLoaderPlugin = require('vuetify-loader/lib/plugin')

module.exports = {
  mode: 'spa',
  srcDir: 'public/',
  buildDir: 'nuxt-dist',
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
    { src: '~plugins/session' },
    { src: '~plugins/vuetify' },
    { src: '~plugins/moment' },
    { src: '~plugins/truncate' },
    { src: '~plugins/display-bytes' },
    { src: '~plugins/logger', ssr: false },
    { src: '~plugins/analytics', ssr: false }
  ],
  router: {
    base: config.basePath
  },
  modules: ['@digibytes/markdownit', '@nuxtjs/axios', 'cookie-universal-nuxt', ['nuxt-i18n', {
    seo: false,
    locales: [{ code: 'fr', iso: 'fr-FR' }, { code: 'en', iso: 'es-US' }],
    defaultLocale: 'fr',
    vueI18n: {
      fallbackLocale: 'fr',
      messages: config.i18nMessages
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
    captureUrl: config.captureUrl,
    theme: config.theme
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
    ],
    style: []
  }
}

if (config.theme.cssUrl) {
  module.exports.head.link.push({ rel: 'stylesheet', href: config.theme.cssUrl })
}

if (config.theme.cssText) {
  module.exports.head.style.push({ type: 'text/css', cssText: config.theme.cssText })
}
