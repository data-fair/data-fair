module.exports = {
  port: 8080,
  listenWhenReady: false,
  publicUrl: 'http://localhost:8080',
  wsPublicUrl: 'ws://localhost:8080',
  dataDir: '/data',
  directoryUrl: 'http://localhost:8080',
  privateDirectoryUrl: '',
  openapiViewerUrl: 'https://koumoul.com/openapi-viewer/',
  captureUrl: 'http://capture:8080',
  pluginsDir: './plugins',
  mongoUrl: 'mongodb://localhost:27017/data-fair-' + (process.env.NODE_ENV || 'development'),
  map: {
    // A mapbox style to display geo data
    // style: 'https://free.tilehosting.com/styles/basic/style.json?key=o3lyi2a3gsPOuVB4ZgUv',
    style: './api/v1/remote-services/tileserver-koumoul/proxy/styles/klokantech-basic/style.json',
    // The layer before which ou data layers will be inserted (empty to add layer on top of everything)
    beforeLayer: 'poi_label'
  },
  // By default cross domain requests are accepted for GET routes
  cors: {
    active: true,
    opts: { origin: '*', methods: 'GET,HEAD' }
  },
  elasticsearch: {
    host: 'localhost:9200',
    defaultAnalyzer: 'french',
    maxBulkLines: 10000,
    maxBulkChars: 1000000
  },
  indicesPrefix: 'dataset-' + (process.env.NODE_ENV || 'development'),
  info: {
    termsOfService: 'https://koumoul.com/term-of-service',
    contact: {
      name: 'Koumoul',
      url: 'https://koumoul.com',
      email: 'support@koumoul.com'
    }
  },
  brand: {
    logo: null,
    title: 'DataFair',
    description: 'Find, Access, Interoperate, Reuse data on the Web'
  },
  defaultLimits: {
    // Maximum storage space per user or organization
    // -1 for unlimited storage
    totalStorage: -1,
    // Maximum storage space for 1 dataset
    datasetStorage: -1,
    remoteServiceRate: {
      duration: 5, // 5 seconds intervals
      nb: 100, // 100 req max in this interval
      kb: 4000 // 4 mb in this interval
    }
  },
  worker: {
    interval: 200,
    concurrency: 8
  },
  adminRole: 'admin',
  // A global default API key for backend to backend calls to remote services
  defaultRemoteKey: {
    in: 'header',
    name: 'x-apiKey',
    value: null
  },
  // secrets that can be used to configure global webhooks for example to update users and organizations
  secretKeys: {
    identities: null,
    quotas: null
  },
  // Configure outgoing http calls
  globalWebhooks: {
    consumption: []
  },
  locks: {
    // in seconds
    ttl: 60
  },
  cache: {
    // set cache-control max-age for public GET endpoints
    publicMaxAge: 10,
    // size of cache of vector tiles in mongodb (in mb)
    size: 1000
  },
  analytics: {}, // a "modules" definition for @koumoul/vue-multianalytics
  i18n: {
    defaultLocale: 'fr',
    locales: [{ code: 'fr', iso: 'fr-FR' }, { code: 'en', iso: 'es-US' }]
  },
  theme: {
    logo: null,
    dark: false,
    colors: {
      // standard vuetify colors
      primary: '#1E88E5', // blue.darken1
      secondary: '#42A5F5', // blue.lighten1,
      accent: '#FF9800', // orange.base
      error: 'FF5252', // red.accent2
      info: '#2196F3', // blue.base
      success: '#4CAF50', // green.base
      warning: '#E91E63' // pink.base
    },
    cssUrl: null,
    cssText: ''
  },
  browserLogLevel: 'error',
  thumbor: {
    url: 'http://localhost:8000',
    key: 'thumborkey'
  },
  prebuilt: false,
  licenses: [{
    title: 'Licence Ouverte / Open Licence',
    href: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence'
  }, {
    title: 'Open Database License (ODbL)',
    href: 'https://spdx.org/licenses/ODbL-1.0.html#licenseText'
  }],
  applications: [{
    title: 'Infos parcelles',
    url: 'https://koumoul.com/apps/infos-parcelles/2.2/'
  }, {
    title: 'Infos localisations',
    url: 'https://koumoul.com/apps/infos-loc/0.6/'
  }, {
    title: 'Graphiques simples',
    url: 'https://koumoul-dev.github.io/data-fair-charts/0.5/'
  }, {
    title: 'Nuages de mots',
    url: 'https://koumoul.com/apps/word-cloud/0.2/'
  }, {
    title: 'Diagramme de flux (Sankey)',
    url: 'https://koumoul.com/apps/sankey/0.1/'
  }],
  remoteServices: [{
    title: 'Données Entreprises',
    url: 'https://koumoul.com/s/sirene/api-docs.json'
  }, {
    title: 'Géocoder',
    url: 'https://koumoul.com/s/geocoder/api/v1/api-docs.json'
  }, {
    title: 'Cadastre',
    url: 'https://koumoul.com/s/cadastre/api-docs.json'
  }, {
    title: 'Divisions administratives',
    url: 'https://koumoul.com/s/insee-mapping/api/v1/api-docs.json'
  }, {
    title: 'Service de données cartographiques',
    url: 'https://koumoul.com/s/tileserver/api/v1/api-docs.json'
  }],
  catalogs: [{
    title: 'Data.gouv.fr',
    href: 'https://www.data.gouv.fr'
  }]
}
