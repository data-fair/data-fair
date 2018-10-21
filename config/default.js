module.exports = {
  port: 8080,
  listenWhenReady: false,
  publicUrl: 'http://localhost:8080',
  wsPublicUrl: 'ws://localhost:8080',
  dataDir: '/data',
  directoryUrl: 'http://localhost:8080',
  privateDirectoryUrl: '',
  openapiViewerUrl: 'https://koumoul.com/openapi-viewer/',
  pluginsDir: './plugins',
  mongoUrl: 'mongodb://localhost:27017/data-fair-' + (process.env.NODE_ENV || 'development'),
  map: {
    // A mapbox style to display geo data
    // style: 'https://free.tilehosting.com/styles/basic/style.json?key=o3lyi2a3gsPOuVB4ZgUv',
    style: 'https://koumoul.com/s/tileserver/styles/klokantech-basic/style.json',
    // The layer before which ou data layers will be inserted (empty to add layer on top of everything)
    beforeLayer: 'poi_label'
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
    datasetStorage: -1
  },
  workers: {
    concurrency: 2,
    pollingInterval: 100
  },
  headers: {
    storedBytesLimit: 'X-TaxMan-RateLimit-Limit-StoreBytes',
    storedBytesRemaining: 'X-TaxMan-RateLimit-Remaining-StoreBytes'
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
    ownerNames: null
  },
  locks: {
    // in seconds
    ttl: 60
  },
  cache: {
    // set cache-control max-age for public GET endpoints
    publicMaxAge: 1000,
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
  licenses: [{
    title: 'Licence Ouverte / Open Licence',
    href: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence'
  }, {
    title: 'Open Database License (ODbL)',
    href: 'https://spdx.org/licenses/ODbL-1.0.html#licenseText'
  }],
  applications: [{
    title: 'Infos parcelles (bêta)',
    url: 'https://koumoul.com/s/infos-parcelles/',
    public: true,
    servicesFilters: [{ 'api-id': ['geocoder-koumoul'] }, { 'api-id': ['tileserver'] }],
    datasetsFilters: [{ bbox: ['true'], concepts: ['http://dbpedia.org/ontology/codeLandRegistry'] }]
  }, {
    title: 'Infos localisations (bêta)',
    url: 'https://koumoul.com/s/infos-loc/',
    public: true,
    servicesFilters: [{ 'api-id': ['geocoder-koumoul'] }, { 'api-id': ['tileserver'] }],
    datasetsFilters: [{ bbox: ['true'] }]
  }, {
    title: 'Portail thématique (bêta)',
    url: 'https://koumoul.com/s/portail-thematique/',
    public: true
  }, {
    title: 'Observatoire des entreprises (bêta)',
    url: 'https://koumoul.com/apps/observatoire-entreprises/0/',
    public: true,
    servicesFilters: [{ 'api-id': ['geocoder-koumoul'] }, { 'api-id': ['tileserver'] }, { 'api-id': ['sirene-koumoul'] }]
  }, {
    title: 'Graphiques simples (bêta)',
    url: 'https://koumoul-dev.github.io/data-fair-charts/0.x/',
    public: true
  }, {
    title: 'Nuages de mots (bêta)',
    url: 'https://koumoul.com/apps/word-cloud/0/',
    public: true
  }],
  remoteServices: [{
    title: 'Données Entreprises',
    href: 'https://koumoul.com/s/sirene/api-docs.json'
  }, {
    title: 'Géocoder',
    href: 'https://koumoul.com/s/geocoder/api/v1/api-docs.json'
  }, {
    title: 'Cadastre',
    href: 'https://koumoul.com/s/cadastre/api-docs.json'
  }, {
    title: 'Divisions administratives',
    href: 'https://koumoul.com/s/insee-mapping/api/v1/api-docs.json'
  }, {
    title: 'Service de données cartographiques',
    href: 'https://koumoul.com/s/tileserver/api/v1/api-docs.json'
  }],
  catalogs: [{
    title: 'Data.gouv.fr',
    href: 'https://www.data.gouv.fr'
  }]
}
