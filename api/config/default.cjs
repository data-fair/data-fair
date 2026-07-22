module.exports = {
  mode: 'server_worker', // can be server_worker, server or worker
  port: 8080,
  publicUrl: 'http://localhost:8080',
  oldPublicUrl: '', // special case when changing path of data-fair
  wsPublicUrl: 'ws://localhost:8080',
  dataDir: '/data', // on a volume shared accross all nodes if data-fair is scaled
  // tmpDir: '/data/tmp' // a local work directory for each node, defaults to dataDir + '/tmp
  filesStorage: 'fs', // fs or s3
  s3: {
    region: '',
    endpoint: '',
    bucket: '',
    credentials: {
      accessKeyId: '',
      secretAccessKey: '',
    },
    forcePathStyle: true,
    maxSingleCopySize: 5 * 1024 * 1024 * 1024, // 5GB - threshold for using multipart copy
    multipartChunkSize: 100 * 1024 * 1024, // 100MB - chunk size for multipart copy
  },
  integrity: {
    active: false,
    s3: {
      region: '',
      endpoint: '',
      bucket: '',
      credentials: {
        accessKeyId: '',
        secretAccessKey: '',
      },
      forcePathStyle: true,
    },
    retention: { days: 365 },
    lines: { maxLines: 100000 },
    // how long a synchronous admin action (enable/fix/restore/check) waits for the per-dataset
    // worker lock before answering 409 — it must hold that lock to not race the relay tasks
    lockWaitMs: 10000,
    // trail-coherence verdict: tolerated distance between a revision's claimed context.date and
    // the provider-stamped LastModified (relay retries legitimately delay the object write)
    trail: { dateSkewHours: 48 },
  },
  integrityCheckCron: '0 4 * * *', // daily at 4 AM, sliding integrity sweep
  sessionDomain: null,
  directoryUrl: 'http://localhost:8080',
  privateDirectoryUrl: null,
  captureUrl: 'http://capture:8080',
  privateCaptureUrl: null,
  privateCatalogsUrl: null,
  privateEventsUrl: null,
  privatePortalsManagerUrl: null,
  privateProcessingsUrl: null,
  privateMetricsUrl: null,
  privateAgentsUrl: null,
  privateOpenapiViewerUrl: null,
  privateRegistryUrl: null,
  subscriptionUrl: null,
  pluginsDir: './plugins',
  mongo: {
    url: 'mongodb://localhost:27017/data-fair-' + (process.env.NODE_ENV || 'development'),
    maxBulkOps: 1000,
    options: {} // optional mongo client options
  },
  map: {
    // a maplibre style to display geo data
    // a relative "./" prefix is resolved against the site root, an absolute URL is used as is
    style: './tileserver/styles/klokantech-basic/style.json',
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
    acceptYellowStatus: false, // change to "true" to tolerate a single node instance
    diagnose: {
      segmentsPerShardWarn: 30,
      deletedRatioWarn: 0.2,
      mappingFieldsLimitWarn: 0.8,
      minShardSize: 1000000000, // 1go
      longTaskMs: 1000, // tasks running longer than this are surfaced on the admin ES page
      unassignedExplainCap: 20, // cap calls to cluster.allocationExplain per request
      maxLongTasksPerCategory: 100 // cap per-bucket long tasks returned by the diagnose endpoint (search / other)
    }
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
      primary: '#1976D2', // blue-darken-2
      secondary: '#42A5F5', // blue.lighten1,
      accent: '#AA00FF', // purple-accent-4
      error: '#FF5252', // red.accent2
      info: '#2196F3', // blue.base
      success: '#4CAF50', // green.base
      warning: '#E91E63', // pink.base
      admin: '#E53935' // red.darken1
    },
    darkColors: { },
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
        // time-weighted ("compute budget") limit: max cumulated Elasticsearch query time (in ms) over
        // the same interval; 429 afterwards. 0 = disabled. See docs/architecture/load-management.md
        computeMs: 20000, // 20 s of ES query time per 60 s
        // in bytes per second, no 429, instead the stream is throttled
        bandwidth: {
          // used by routes with dynamic contents (search mostly)
          dynamic: 500000, // 500 kB/s
          // used by routes with static files content
          static: 8000000 // 8 mB/s
        }
      },
      user: {
        duration: 60, // second intervals
        nb: 1200, // req max in this interval, 429 afterwards
        // see anonymous.computeMs above; >= the ES searchTimeout (45 s) so a single legitimate slow
        // query never locks an authenticated client out for a window
        computeMs: 60000, // 60 s of ES query time per 60 s
        // in bytes per second, no 429, instead the stream is throttled
        bandwidth: {
          // used by routes with dynamic contents (search mostly)
          dynamic: 1000000, // 1 mB/s
          // used by routes with static files content
          static: 16000000 // 16 mB/s
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
    baseConcurrency: 2,
    // fraction (0-1) of a worker's slots a single account/owner may use concurrently.
    // 1 = full concurrency (a single owner can use every slot, fair-allocation rules disabled), suitable for
    // mono-organization deployments. Lower it (e.g. 0.5) on shared multi-organization deployments.
    concurrencyLimitPerAccount: 1,
    errorRetryDelay: 600000, // 10 minutes
    closeTimeout: 60000 // 10 minutes to finish running tasks before shutting down
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
    sendMails: null,
    ignoreRateLimiting: null,
    registry: null // shared with the registry service; reserved for future server-to-server calls
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
    maxThreads: 1,
    // geometries with more vertices than this are simplified (Douglas-Peucker) before
    // being stored in the calculated _geoshape field (used for tiles/geojson/wkt/spatial
    // queries); the raw geometry column is left at full precision. ~50000 verts ≈ 2MB.
    // -1 disables simplification.
    simplifyMaxVertices: 50000
  },
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
  // lines per request to a remote service (and per extensions-cache bulk read/write) when
  // applying extensions. Large enough that the per-batch fixed costs (HTTP request, cache
  // round-trips) stay marginal, small enough to bound the lines held in memory per batch.
  extensionsBatchSize: 250,
  compatODS: false,
  apiKeysMaxDuration: 2 * 365, // in days
  apiKeysExpirationCron: '0 3 * * *', // daily at 3 AM, scan apiKeys expireAt and notify J-3 / J
}
