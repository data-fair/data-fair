module.exports = {
  mode: 'server_worker', // can be server_worker, server or worker
  port: 8080,
  serveUi: true,
  listenWhenReady: false,
  publicUrl: 'http://localhost:8080',
  oldPublicUrl: '', // special case when changing path of data-fair
  wsPublicUrl: 'ws://localhost:8080',
  dataDir: '/data',
  sessionDomain: null,
  directoryUrl: 'http://localhost:8080',
  privateDirectoryUrl: null,
  openapiViewerUrl: 'https://koumoul.com/openapi-viewer/',
  captureUrl: 'http://capture:8080',
  privateCaptureUrl: null,
  privateCatalogsUrl: null,
  notifyUrl: null, // DEPRECATED
  privateNotifyUrl: null, // DEPRECATED
  notifyWSUrl: null, // DEPRECATED
  privateEventsUrl: null,
  subscriptionUrl: null,
  pluginsDir: './plugins',
  mongo: {
    url: 'mongodb://localhost:27017/data-fair-' + (process.env.NODE_ENV || 'development'),
    maxBulkOps: 1000,
    options: {} // optional mongo client options
  },
  map: {
    // A mapbox style to display geo data
    // style: 'https://free.tilehosting.com/styles/basic/style.json?key=o3lyi2a3gsPOuVB4ZgUv',
    style: './api/v1/remote-services/tileserver-koumoul/proxy/styles/klokantech-basic/style.json',
    // The layer before which ou data layers will be inserted (empty to add layer on top of everything)
    beforeLayer: 'poi_label'
  },
  elasticsearch: {
    host: 'localhost:9200',
    auth: null,
    nodes: null,
    options: {},
    ca: null, // the central authority for the ES cluster certificates
    defaultAnalyzer: 'custom_french',
    maxBulkLines: 2000,
    maxBulkChars: 200000,
    maxShardSize: 10000000000, // 10go
    nbReplicas: 1,
    maxPageSize: 10000,
    singleLineOpRefresh: 'wait_for',
    searchTimeout: '45s', // bound search complexity, TODO: measure actual requests and lower this to a more reasonable value
    acceptYellowStatus: false // change to "true" to tolerate a single node instance
  },
  indicesPrefix: 'dataset-' + (process.env.NODE_ENV || 'development'),
  info: {
    termsOfService: '',
    contact: {
      name: '',
      url: ''
      // email: '',
    }
  },
  brand: {
    logo: null,
    title: 'Data Fair',
    description: 'Find, Access, Interoperate, Reuse data on the Web',
    url: null,
    embed: null
  },
  theme: {
    dark: false,
    colors: {
      primary: '#1E88E5', // blue.darken1
      secondary: '#42A5F5', // blue.lighten1,
      accent: '#FF9800', // orange.base
      error: '#FF5252', // red.accent2
      info: '#2196F3', // blue.base
      success: '#4CAF50', // green.base
      warning: '#E91E63', // pink.base
      admin: '#E53935' // red.darken1
    },
    darkColors: {
      primary: '#2196F3', // blue.base
      success: '#00E676' // green.accent3
    },
    cssUrl: null,
    cssText: ''
  },
  darkModeSwitch: true,
  defaultLimits: {
    // Maximum storage space per user or organization
    // -1 for unlimited storage
    totalStorage: -1,
    totalIndexed: -1,
    // Maximum storage space for 1 dataset
    datasetStorage: -1,
    datasetIndexed: -1,
    // maximum number of datasets
    nbDatasets: -1,
    // Maximum storage space for 1 attachment
    attachmentStorage: -1,
    // Maximum size for attachment to be indexed
    attachmentIndexed: 5 * 1000 * 1000,
    // Limits applied to all API requests
    apiRate: {
      anonymous: {
        duration: 60, // seconds intervals
        nb: 600, // req max in this interval, 429 afterwards
        // in bytes per second, no 429, instead the stream is throttled
        bandwidth: {
          // used by routes with dynamic contents (search mostly)
          dynamic: 500000, // 500 kB/s
          // used by routes with static files content
          static: 2000000 // 2 mB/s
        }
      },
      user: {
        duration: 60, // second intervals
        nb: 1200, // req max in this interval, 429 afterwards
        // in bytes per second, no 429, instead the stream is throttled
        bandwidth: {
          // used by routes with dynamic contents (search mostly)
          dynamic: 1000000, // 1 mB/s
          // used by routes with static files content
          static: 8000000 // 8mB/s
        }
      },
      remoteService: {
        duration: 5, // 5 seconds intervals
        nb: 100, // 100 req max in this interval, 429 afterwards
        // in bytes per second, no 429, instead the stream is throttled
        bandwidth: {
          dynamic: 500000 // 500 kB/s
        }
      },
      postApplicationKey: {
        duration: 60,
        nb: 1
      },
      appCaptures: {
        duration: 60,
        nb: 5
      }
    },
    hideBrand: 0,
    maxSpreadsheetSize: 50 * 1000 * 1000 // 50mo
  },
  worker: {
    // base interval for polling the database for new resources to work on
    interval: 4000,
    concurrency: 4,
    spawnTask: true,
    errorRetryDelay: 600000 // 10 minutes
  },
  adminRole: 'admin',
  contribRole: 'contrib',
  userRole: 'user',
  // secrets that can be used to configure global webhooks for example to update users and organizations
  secretKeys: {
    identities: null,
    limits: null,
    catalogs: null,
    notifications: null, // DEPRECATED
    events: null,
    ignoreRateLimiting: null
  },
  // Configure outgoing http calls
  globalWebhooks: {
    consumption: []
  },
  locks: {
    // in seconds
    ttl: 60
  },
  datasetStateRetries: {
    interval: 500,
    nb: 20
  },
  cache: {
    // set cache-control max-age for public GET endpoints (in seconds)
    publicMaxAge: 300, // 5 minutes
    timestampedPublicMaxAge: 60 * 60 * 24 * 7, // 1 week
    // size of cache of vector tiles in mongodb (in mb)
    mongoSize: 2000, // 2G
    reverseProxyCache: false
  },
  tiles: {
    geojsonvtTolerance: 4, // slightly higher simplification than default (3)
    vtPrepareMaxZoom: 10,
    maxThreads: 1
  },
  analytics: {}, // a "modules" definition for @koumoul/vue-multianalytics
  browserLogLevel: 'error',
  nuxtDev: false,
  // used to configure service workers in cacheFirst mode for common directories of base applications source code
  applicationsDirectories: [
    'https://koumoul.com/apps/',
    'https://staging-koumoul.com/apps/',
    'https://koumoul-dev.github.io/',
    'https://data-fair.github.io/',
    'https://cdn.jsdelivr.net/npm/@koumoul/',
    'https://cdn.jsdelivr.net/npm/@data-fair/',
    'https://cdn.jsdelivr.net/npm/iframe-resizer'
  ],
  applications: [],
  applicationsPrivateMapping: ['', ''], // an optional 2 items array mapping url prefixes from application to the local equivalent
  baseAppsCategories: ['carte', 'graphique', 'textuelle', 'SCDL'],
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
    title: 'Service de données cartographiques',
    id: 'tileserver-koumoul',
    description: 'Ce service expose les données cartographiques traitées par Koumoul sous divers formats standards.',
    server: 'https://koumoul.com/s/tileserver'
  }],
  remoteServicesPrivateMapping: ['', ''], // an optional 2 items array mapping url prefixes from remote service to the local equivalent
  catalogs: [{
    title: 'Data.gouv.fr',
    href: 'https://www.data.gouv.fr',
    logo: 'https://static.data.gouv.fr/_themes/gouvfr/img/logo-header.svg'
  }],
  // A global default API key for backend to backend calls to remote services
  defaultRemoteKey: {
    in: 'header',
    name: 'x-apiKey',
    value: null
  },
  remoteTimeout: 10000,
  disableSharing: false,
  disableApplications: false,
  disableRemoteServices: false,
  disablePublicationSites: false,
  proxyNuxt: false,
  ogr2ogr: {
    skip: false,
    timeout: 360000 // 6 minutes
  },
  extraNavigationItems: [],
  extraAdminNavigationItems: [],
  extraDocLinks: [],
  // cf https://momentjs.com/docs/#/parsing/string-format/ en mode strict
  // french formats for now, TODO: prepare for internationalization
  dateFormats: [
    'D/M/YYYY',
    'D/M/YY',
    'YYYY/M/D' // this one is not "french" but it is ok to add it, it not ambiguous
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
    'YYYY-MM-DDTHH:mm:ss', // shorter iso not accepted by json schema date-time format
    'YYYY-MM-DD HH:mm:ss' // shorter iso not accepted by json schema date-time format
  ],
  defaultTimeZone: 'Europe/Paris',
  i18n: {
    locales: 'fr,en',
    defaultLocale: 'fr'
  },
  exportRestDatasets: {
    cron: '0 6 * * 0'
  },
  catalogAutoUpdates: {
    cron: '0 22 * * 0'
  },
  remoteFilesAutoUpdates: {
    cron: '0 23 * * 0'
  },
  observer: {
    active: true,
    port: 9090
  },
  agentkeepaliveOptions: {
    maxSockets: 128,
    maxFreeSockets: 128,
    timeout: 60000,
    freeSocketTimeout: 30000
  },
  clamav: {
    active: false,
    host: 'localhost',
    port: 3310,
    dataDir: '/data/data-fair'
  },
  assertImmutable: false,
  remoteAttachmentCacheDuration: 1000 * 5,
  extensionUpdateDelay: 600,
  compatODS: false,
  openapiViewerV2: false
}
