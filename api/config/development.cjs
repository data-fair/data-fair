require('dotenv').config({ quiet: true })

if (!process.env.DEV_API_PORT) throw new Error('missing DEV_API_PORT env variable, use "source dev/init-env.sh" to init .env file')

module.exports = {
  port: process.env.DEV_API_PORT,
  dataDir: '../data/development',
  mongo: {
    url: `mongodb://localhost:${process.env.MONGO_PORT}/data-fair-development`,
    maxBulkOps: 100
  },
  elasticsearch: {
    host: `localhost:${process.env.ES_PORT}`,
    acceptYellowStatus: true,
    singleLineOpRefresh: true
  },
  filesStorage: 'fs',
  publicUrl: `http://localhost:${process.env.NGINX_PORT1}/data-fair`,
  wsPublicUrl: `ws://localhost:${process.env.NGINX_PORT1}/data-fair`,
  s3: {
    region: 'us-east-1',
    endpoint: `http://localhost:${process.env.S3_PORT}`,
    bucket: 'bucketdev',
    credentials: {
      accessKeyId: '',
      secretAccessKey: '',
    },
    forcePathStyle: true
  },
  directoryUrl: `http://localhost:${process.env.NGINX_PORT1}/simple-directory`,
  privateDirectoryUrl: `http://localhost:${process.env.SD_PORT}`,
  captureUrl: `http://localhost:${process.env.NGINX_PORT1}/capture`,
  privateCaptureUrl: `http://localhost:${process.env.CAPTURE_PORT}`,
  privateEventsUrl: `http://localhost:${process.env.EVENTS_PORT}`,
  privateAgentsUrl: `http://localhost:${process.env.AGENTS_PORT}`,
  brand: {
    embed: '<div>application embed</div>'
  },
  defaultLimits: {
    totalStorage: 200000,
    datasetStorage: 160000,
    nbDatasets: 20,
    remoteServiceRate: {
      duration: 1,
      nb: 10,
      kb: 50
    },
    apiRate: {
      anonymous: {
        duration: 1,
        nb: 100,
        bandwidth: {
          dynamic: 100000,
          static: 200000
        }
      },
      user: {
        duration: 1,
        nb: 100,
        bandwidth: {
          dynamic: 200000,
          static: 400000
        }
      },
      postApplicationKey: {
        duration: 60,
        nb: 1
      },
      appCaptures: {
        duration: 60,
        nb: 10
      }
    }
  },
  worker: {
    interval: 500,
    baseConcurrency: 1,
    errorRetryDelay: 0,
    closeTimeout: 1
  },
  locks: {
    // in seconds
    ttl: 1
  },
  datasetStateRetries: {
    interval: 1,
    nb: 1
  },
  defaultRemoteKey: {
    in: 'header',
    name: 'x-apiKey',
    value: 'test_default_key'
  },
  remoteTimeout: 500,
  secretKeys: {
    identities: 'identities-test-key',
    limits: 'limits-test-key',
    events: 'secret-notifications',
    catalogs: 'secret-catalogs'
  },
  nuxtBuild: {
    active: false
  },
  applications: [{
    title: 'App test1',
    url: `http://localhost:${process.env.MOCK_PORT}/monapp1`,
    public: true
  }, {
    title: 'App test2',
    url: `http://localhost:${process.env.MOCK_PORT}/monapp2`
  }, {
    title: 'App test3',
    url: `http://localhost:${process.env.MOCK_PORT}/monapp3`,
    public: true
  }],
  remoteServices: [{
    title: 'Geocoder',
    url: `http://localhost:${process.env.MOCK_PORT}/geocoder/api-docs.json`
  }, {
    title: 'Sirene',
    url: `http://localhost:${process.env.MOCK_PORT}/sirene/api-docs.json`
  }],
  observer: {
    active: false,
    port: process.env.DEV_OBSERVER_PORT
  },
  cache: {
    publicMaxAge: 1,
    disabled: true
  },
  clamav: {
    active: true,
    dataDir: '/data/data-fair/development',
    port: process.env.CLAMAV_PORT,
  },
  assertImmutable: true,
  remoteAttachmentCacheDuration: 1000,
  compatODS: true,
  browserLogLevel: 'debug',
  catalogs: [{
    title: 'Data.gouv.fr',
    href: 'https://www.data.gouv.fr'
  }, {
    title: 'Mydatacatalogue',
    href: 'https://app.dawizz.fr/mydatacatalogue/'
  }],
  proxyNuxt: true,
  extraNavigationItems: [
    {
      id: 'test',
      title: { fr: 'Test', en: 'Test en' },
      iframe: `http://localhost:${process.env.NGINX_PORT1}/data-fair/_dev/extra`,
      basePath: '/data-fair',
      icon: 'mdi-link',
      group: 'help'
    }
  ],
  extraAdminNavigationItems: [
    {
      id: 'test',
      title: { fr: 'Test admin', en: 'Test admin en' },
      iframe: 'https://koumoul.com',
      icon: 'mdi-link'
    }
  ],
  extraDocLinks: [
    {
      title: 'Manuel utilisateur',
      href: 'https://docs.koumoul.com/',
      icon: 'mdi-book-open-variant'
    }
  ],
  disableSharing: false,
  disableApplications: false,
  disableRemoteServices: false,
  disablePublicationSites: false,
  agentkeepaliveOptions: {
    keepAlive: false
  },
}
