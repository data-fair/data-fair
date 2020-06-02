module.exports = {
  mode: 'server_worker', // can be server_worker, server or worker
  port: 8080,
  listenWhenReady: false,
  publicUrl: 'http://localhost:8080',
  wsPublicUrl: 'ws://localhost:8080',
  dataDir: '/data',
  sessionDomain: null,
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
    beforeLayer: 'poi_label',
  },
  elasticsearch: {
    host: 'localhost:9200',
    defaultAnalyzer: 'french',
    maxBulkLines: 5000,
    maxBulkChars: 500000,
    requestTimeout: 60000,
  },
  indicesPrefix: 'dataset-' + (process.env.NODE_ENV || 'development'),
  info: {
    termsOfService: 'https://koumoul.com/term-of-service',
    contact: {
      name: 'Koumoul',
      url: 'https://koumoul.com',
      email: 'support@koumoul.com',
    },
  },
  brand: {
    logo: null,
    title: 'DataFair',
    description: 'Find, Access, Interoperate, Reuse data on the Web',
    embed: null,
  },
  theme: {
    dark: false,
    colors: {
      // standard vuetify colors
      primary: '#1E88E5', // blue.darken1
      secondary: '#42A5F5', // blue.lighten1,
      accent: '#FF9800', // orange.base
      error: 'FF5252', // red.accent2
      info: '#2196F3', // blue.base
      success: '#4CAF50', // green.base
      warning: '#E91E63', // pink.base
      admin: '#E53935', // red.darken1
    },
    cssUrl: null,
    cssText: '',
  },
  defaultLimits: {
    // Maximum storage space per user or organization
    // -1 for unlimited storage
    totalStorage: -1,
    // Maximum storage space for 1 dataset
    datasetStorage: -1,
    // Maximum storage space for 1 attachment
    attachmentStorage: 100 * 1000 * 1000,
    // Maximum size for attachment to be indexed
    attachmentIndexed: 5 * 1000 * 1000,
    // Limits applied to public re-exposition of remote services used by public applications
    // will respond with 429 errors when these limits are exceeded
    remoteServiceRate: {
      duration: 5, // 5 seconds intervals
      nb: 100, // 100 req max in this interval
      kb: 4000, // 4 mb in this interval
    },
    // Limits applied to all API requests
    apiRate: {
      anonymous: {
        duration: 5, // 5 seconds intervals
        nb: 100, // 100 req max in this interval, 429 afterwards
        // in bytes per second, no 429, instead the stream is throttled
        bandwidth: {
          // used by routes with streamed dynamic contents (search mostly)
          dynamic: 100000, // 100 kb/s
          // used by routes with streamed static files content
          static: 500000, // 500 kb/s
        },
      },
      user: {
        duration: 1, // 1 second intervals
        nb: 100, // 100 req max in this interval, 429 afterwards
        // in bytes per second, no 429, instead the stream is throttled
        bandwidth: {
          // used by routes with streamed dynamic contents (search mostly)
          dynamic: 200000, // 200 kb/s
          // in bytes per second, no 429, instead the stream is throttled
          // used by routes with streamed static files content
          static: 1000000, // 1mb/s
        },
      },
    },
    // Limits applied
    hideBrand: 0,
  },
  worker: {
    interval: 200,
    releaseInterval: 2000,
    concurrency: 4,
    spawnTask: true,
  },
  adminRole: 'admin',
  // A global default API key for backend to backend calls to remote services
  defaultRemoteKey: {
    in: 'header',
    name: 'x-apiKey',
    value: null,
  },
  remoteTimeout: 5000,
  // secrets that can be used to configure global webhooks for example to update users and organizations
  secretKeys: {
    identities: null,
    limits: null,
  },
  // Configure outgoing http calls
  globalWebhooks: {
    consumption: [],
  },
  locks: {
    // in seconds
    ttl: 60,
  },
  cache: {
    // set cache-control max-age for public GET endpoints (in seconds)
    publicMaxAge: 20,
    timestampedPublicMaxAge: 60 * 60 * 24 * 7,
    // size of cache of vector tiles in mongodb (in mb)
    size: 1000,
  },
  analytics: {}, // a "modules" definition for @koumoul/vue-multianalytics
  browserLogLevel: 'error',
  thumbor: {
    url: 'http://localhost:8000',
    key: 'thumborkey',
  },
  nuxtDev: false,
  licenses: [{
    title: 'Licence Ouverte / Open Licence',
    href: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
  }, {
    title: 'Open Database License (ODbL)',
    href: 'https://spdx.org/licenses/ODbL-1.0.html#licenseText',
  }],
  // used to configure service workers in cacheFirst mode for common directories of base applications
  applicationsDirectories: [
    'https://koumoul.com/apps/',
    'https://cdn.jsdelivr.net/npm/@koumoul/',
  ],
  applications: [{
    url: 'https://koumoul.com/apps/infos-parcelles/2.2/',
  }, {
    url: 'https://koumoul.com/apps/infos-loc/0.7/',
  }, {
    url: 'https://cdn.jsdelivr.net/npm/@koumoul/data-fair-charts@0.8/dist/',
  }, {
    url: 'https://koumoul.com/apps/word-cloud/0.2/',
  }, {
    url: 'https://koumoul.com/apps/sankey/0.5/',
  }, {
    url: 'https://koumoul.com/apps/sunburst/0.2/',
  }],
  remoteServices: [{
    title: 'Données Entreprises',
    url: 'https://koumoul.com/s/sirene/api-docs.json',
  }, {
    title: 'Géocoder',
    url: 'https://koumoul.com/s/geocoder/api/v1/api-docs.json',
  }, {
    title: 'Cadastre',
    url: 'https://koumoul.com/s/cadastre/api-docs.json',
  }, {
    title: 'Divisions administratives',
    url: 'https://koumoul.com/s/insee-mapping/api/v1/api-docs.json',
  }, {
    title: 'Service de données cartographiques',
    url: 'https://koumoul.com/s/tileserver/api/v1/api-docs.json',
  }],
  catalogs: [{
    title: 'Data.gouv.fr',
    href: 'https://www.data.gouv.fr',
    logo: 'https://static.data.gouv.fr/_themes/gouvfr/img/logo-header.svg',
  }],
  proxyNuxt: false,
  tippecanoe: {
    docker: false,
    args: ['-zg', '--extend-zooms-if-still-dropping', '--drop-fraction-as-needed'],
  },
}
