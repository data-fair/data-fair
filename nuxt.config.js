const config = require('config')

module.exports = {
  dev: process.env.NODE_ENV === 'development',
  srcDir: 'public/',
  build: {
    publicPath: config.publicUrl + '/_nuxt/',
    extractCSS: true
  },
  loading: { color: '#1e88e5' }, // Customize the progress bar color
  plugins: [
    {src: '~plugins/interceptor', ssr: false},
    {src: '~plugins/exchange-jwt', ssr: false},
    {src: '~plugins/ws', ssr: false},
    {src: '~plugins/vuetify'},
    {src: '~plugins/moment'},
    {src: '~plugins/truncate'}
  ],
  router: {
    base: ('/' + config.publicUrl.split('//')[1].split('/').slice(1).join('/')).replace('//', '/')
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
    adminRole: config.adminRole
  },
  head: {
    title: config.htmlMeta.title,
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { hid: 'application', name: 'application-name', content: config.htmlMeta.title },
      { hid: 'description', name: 'description', content: config.htmlMeta.description }
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
