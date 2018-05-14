const config = require('config')
const URL = require('url').URL

module.exports = {
  dev: process.env.NODE_ENV === 'development',
  srcDir: 'public/',
  build: {
    publicPath: config.publicUrl + '/_nuxt/',
    extractCSS: true,
    vendor: ['babel-polyfill'],
    // Use babel polyfill, not runtime transform to support Array.includes and other methods
    // cf https://github.com/nuxt/nuxt.js/issues/93
    babel: {
      presets: [
        ['vue-app', {useBuiltIns: true, targets: { ie: 11, uglify: true }}]
      ]
    }
  },
  loading: { color: '#1e88e5' }, // Customize the progress bar color
  plugins: [
    {src: '~plugins/ws', ssr: false},
    {src: '~plugins/vuetify'},
    {src: '~plugins/moment'},
    {src: '~plugins/truncate'}
  ],
  router: {
    base: new URL(config.publicUrl + '/').pathname
  },
  modules: ['@nuxtjs/axios'],
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
    brand: config.brand
  },
  head: {
    title: config.brand.title,
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'application', name: 'application-name', content: config.brand.title },
      { hid: 'description', name: 'description', content: config.brand.description }
    ],
    link: [
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css?family=Nunito:300,400,500,700,400italic|Material+Icons' }
    ]
  }
}

if (config.analytics) {
  module.exports.modules.push(['@nuxtjs/google-analytics', {
    id: config.analytics,
    autoTracking: {exception: true}
  }])
}
