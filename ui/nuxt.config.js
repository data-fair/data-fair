import { URL } from 'url'
import _config from '@data-fair/data-fair-api/src/config.ts'
import clone from '@data-fair/lib-utils/clone.js'
import nuxtConfigInject from '@koumoul/nuxt-config-inject'
import fr from 'vuetify/es5/locale/fr'
import en from 'vuetify/es5/locale/en'

let config = clone(_config)

config.basePath = new URL(config.publicUrl + '/').pathname

const isBuilding = process.argv[2] === 'build'

if (process.env.NODE_ENV === 'production') {
  if (isBuilding) config = nuxtConfigInject.prepare(config)
  else nuxtConfigInject.replace(config, ['nuxt-dist/**/*', 'public/static/**/*'])
}

let vuetifyOptions = {}

if (process.env.NODE_ENV !== 'production' || isBuilding) {
  vuetifyOptions = {
    customVariables: ['~assets/variables.scss'],
    theme: {
      dark: config.theme.dark,
      themes: {
        light: config.theme.colors,
        dark: { ...config.theme.colors, ...config.theme.darkColors }
      }
    },
    treeShake: true,
    defaultAssets: false,
    lang: {
      locales: { fr, en },
      current: config.i18n.defaultLocale
    }
  }
}

module.exports = {
  telemetry: false,
  ssr: false,
  components: true,
  srcDir: 'public/',
  buildDir: 'nuxt-dist',
  build: {
    // always the same url to fetch static resource, even in multi-domain mode
    publicPath: config.publicUrl + '/_nuxt/',
    transpile: [/@koumoul/, 'easymde', 'htmlparser2', /@data-fair/], // Necessary for "à la carte" import of vuetify components
    extend (webpackConfig, { isServer, isDev, isClient }) {
      const webpack = require('webpack')
      // Ignore all locale files of moment.js, those we want are loaded in plugins/moment.js
      webpackConfig.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /moment$/ }))
      // source-map to debug in production
      webpackConfig.devtool = webpackConfig.devtool || 'source-map'
    },
    splitChunks: {
      // this would be good for chunk sizes, but it causes double loading of embed pages
      // layouts: true
    }
  },
  loading: { color: '#1e88e5' }, // Customize the progress bar color
  plugins: [
    { src: '~plugins/session' },
    { src: '~plugins/global-components' },
    { src: '~plugins/ws', ssr: false },
    { src: '~plugins/window-size', ssr: false },
    { src: '~plugins/dynamic-theme' },
    { src: '~plugins/moment' },
    { src: '~plugins/truncate' },
    { src: '~plugins/cell-values' },
    { src: '~plugins/filter-bytes' },
    { src: '~plugins/logger', ssr: false },
    { src: '~plugins/analytics', ssr: false },
    { src: '~plugins/polyfill', ssr: false }
  ],
  router: {
    base: config.basePath
  },
  modules: ['@nuxtjs/axios', 'cookie-universal-nuxt', ['@nuxtjs/i18n', {
    seo: false,
    locales: ['fr', 'en'],
    defaultLocale: config.i18n.defaultLocale,
    vueI18nLoader: true,
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_lang'
    },
    vueI18n: {
      fallbackLocale: config.i18n.defaultLocale
    }
  }]],
  axios: {
    browserBaseURL: config.basePath
    // baseURL: `http://localhost:${config.port}/`,
  },
  buildModules: [
    '@nuxtjs/vuetify',
    '@nuxtjs/svg',
    ['@nuxtjs/google-fonts', { download: true, display: 'swap', families: { Nunito: [100, 300, 400, 500, 700, 900] } }]
  ],
  vuetify: vuetifyOptions,
  env: {
    mainPublicUrl: config.publicUrl,
    basePath: config.basePath,
    directoryUrl: config.directoryUrl,
    adminRole: config.adminRole,
    contribRole: config.contribRole,
    map: config.map,
    brand: config.brand,
    openapiViewerUrl: config.openapiViewerUrl,
    browserLogLevel: config.browserLogLevel,
    analytics: config.analytics,
    captureUrl: config.captureUrl,
    notifyUrl: config.notifyUrl,
    notifyWSUrl: config.notifyWSUrl,
    subscriptionUrl: config.subscriptionUrl,
    theme: config.theme,
    baseAppsCategories: config.baseAppsCategories,
    datasetUrlTemplate: config.datasetUrlTemplate,
    applicationUrlTemplate: config.applicationUrlTemplate,
    doc: config.doc,
    extraNavigationItems: config.extraNavigationItems,
    extraAdminNavigationItems: config.extraAdminNavigationItems,
    extraDocLinks: config.extraDocLinks,
    darkModeSwitch: config.darkModeSwitch,
    disableSharing: config.disableSharing,
    disableApplications: config.disableApplications,
    disableRemoteServices: config.disableRemoteServices,
    disablePublicationSites: config.disablePublicationSites,
    i18n: config.i18n,
    defaultTimeZone: config.defaultTimeZone,
    dateFormats: config.dateFormats,
    dateTimeFormats: config.dateTimeFormats
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
    link: [],
    style: []
  },
  css: [
    '@mdi/font/css/materialdesignicons.min.css'
  ]
}

if (config.theme.cssUrl) {
  module.exports.head.link.push({ rel: 'stylesheet', href: config.theme.cssUrl })
}

if (config.theme.cssText) {
  module.exports.head.style.push({ type: 'text/css', cssText: config.theme.cssText })
}
