module.exports = {
  mode: 'server_worker', // can be server_worker, server or worker
  port: 8080,
  listenWhenReady: false,
  publicUrl: 'http://localhost:8080',
  masterDataPublicUrl: null,
  wsPublicUrl: 'ws://localhost:8080',
  dataDir: '/data',
  sessionDomain: null,
  directoryUrl: 'http://localhost:8080',
  privateDirectoryUrl: '',
  openapiViewerUrl: 'https://koumoul.com/openapi-viewer/',
  captureUrl: 'http://capture:8080',
  privateCaptureUrl: null,
  notifyUrl: null,
  privateNotifyUrl: null,
  notifyWSUrl: null,
  subscriptionUrl: null,
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
    maxBulkLines: 2000,
    maxBulkChars: 200000,
    requestTimeout: 240000, // same as timeout in bulk indexing requests
    maxShardSize: 10000000000, // 10go
    nbReplicas: 1,
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
    url: null,
    embed: null,
  },
  theme: {
    dark: false,
    colors: {
      primary: '#1E88E5', // blue.darken1
      secondary: '#42A5F5', // blue.lighten1,
      accent: '#FF9800', // orange.base
      error: 'FF5252', // red.accent2
      info: '#2196F3', // blue.base
      success: '#4CAF50', // green.base
      warning: '#E91E63', // pink.base
      admin: '#E53935', // red.darken1
    },
    darkColors: {
      primary: '#2196F3', // blue.base
      success: '#00E676', // green.accent3
    },
    cssUrl: null,
    cssText: '',
  },
  darkModeSwitch: true,
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
          dynamic: 500000, // 500 kb/s
          // used by routes with streamed static files content
          static: 2000000, // 2 mb/s
        },
      },
      user: {
        duration: 1, // 1 second intervals
        nb: 100, // 100 req max in this interval, 429 afterwards
        // in bytes per second, no 429, instead the stream is throttled
        bandwidth: {
          // used by routes with streamed dynamic contents (search mostly)
          dynamic: 1000000, // 1 mb/s
          // in bytes per second, no 429, instead the stream is throttled
          // used by routes with streamed static files content
          static: 4000000, // 4mb/s
        },
      },
    },
    hideBrand: 0,
    maxSpreadsheetSize: 50 * 1000 * 1000, // 50mo
  },
  worker: {
    interval: 500,
    releaseInterval: 2000,
    concurrency: 4,
    spawnTask: true,
  },
  adminRole: 'admin',
  contribRole: 'contrib',
  userRole: 'user',
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
    notifications: null,
    masterData: null,
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
  // used to configure service workers in cacheFirst mode for common directories of base applications source code
  applicationsDirectories: [
    'https://koumoul.com/apps/',
    'https://staging-koumoul.com/apps/',
    'https://koumoul-dev.github.io/',
    'https://cdn.jsdelivr.net/npm/@koumoul/',
  ],
  applications: [{
    url: 'https://koumoul.com/apps/infos-parcelles/2.5/',
  }, {
    url: 'https://koumoul.com/apps/infos-loc/0.9/',
  }, {
    url: 'https://cdn.jsdelivr.net/npm/@koumoul/data-fair-charts@0.8/dist/',
  }, {
    url: 'https://koumoul.com/apps/word-cloud/0.3/',
  }, {
    url: 'https://koumoul.com/apps/sankey/0.5/',
  }, {
    url: 'https://koumoul.com/apps/sunburst/0.2/',
  }, {
    url: 'https://koumoul.com/apps/data-fair-networks/0.1/',
  }, {
    url: 'https://koumoul.com/apps/list-details/0.2/',
  }, {
    url: 'https://koumoul.com/apps/carto-stats/0.4/',
  }, {
    url: 'https://koumoul.com/apps/data-fair-series/0.2/',
  }, {
    url: 'https://koumoul.com/apps/data-fair-admin-divs/0.2/',
  }, {
    url: 'https://koumoul.com/apps/bar-chart-race/0.1/',
  }, {
    url: 'https://koumoul.com/apps/data-fair-geo-shapes/0.1/',
  }, {
    url: 'https://koumoul.com/apps/scdl-deliberations/0.1/',
  }, {
    url: 'https://koumoul.com/apps/scdl-equipements/0.1/',
  }, {
    url: 'https://koumoul.com/apps/data-fair-events/1.0/',
  }],
  baseAppsCategories: ['carte', 'graphique', 'textuelle', 'SCDL'],
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
    skip: false,
    minFeatures: 2000,
    docker: false,
    // args: ['-zg', '--extend-zooms-if-still-dropping', '--drop-fraction-as-needed', '--detect-shared-borders', '-r1'],
    args: ['-zg', '--extend-zooms-if-still-dropping', '--drop-densest-as-needed', '--detect-shared-borders', '-r1'],
  },
  datasetUrlTemplate: null,
  applicationUrlTemplate: null,
  doc: {
    applications: null,
    datasets: null,
    datasetEdit: null,
    datasetExtend: null,
    datasetAttachments: null,
    settings: null,
    catalogs: null,
  },
  extraNavigationItems: [],
  extraAdminNavigationItems: [],
  // cf https://momentjs.com/docs/#/parsing/string-format/ en mode strict
  // french formats for now, TODO: prepare for internationalization
  dateFormats: [
    'D/M/YYYY',
    'D/M/YY',
    'YYYY/M/D', // this one is not "french" but it is ok to add it, it not ambiguous
  ],
  dateTimeFormats: [
    'D/M/YYYY H:m',
    'D/M/YY H:m',
    'D/M/YYYY, H:m',
    'D/M/YY, H:m',
    'D/M/YYYY H:m:s',
    'D/M/YY H:m:s',
    'D/M/YYYY, H:m:s',
    'D/M/YY, H:m:s',
  ],
}
