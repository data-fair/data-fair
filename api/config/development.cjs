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
  publicUrl: `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}/data-fair`,
  wsPublicUrl: `ws://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}/data-fair`,
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
  directoryUrl: `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}/simple-directory`,
  privateDirectoryUrl: `http://localhost:${process.env.SD_PORT}`,
  captureUrl: `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}/capture`,
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
    url: `http://localhost:${process.env.MOCK_PORT}/monapp2`,
    public: false
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
      iframe: `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}/data-fair/_dev/extra`,
      basePath: '/data-fair',
      icon: 'M3.9,12C3.9,10.29 5.29,8.9 7,8.9H11V7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H11V15.1H7C5.29,15.1 3.9,13.71 3.9,12M8,13H16V11H8V13M17,7H13V8.9H17C18.71,8.9 20.1,10.29 20.1,12C20.1,13.71 18.71,15.1 17,15.1H13V17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7Z',
      group: 'help'
    }
  ],
  extraAdminNavigationItems: [
    {
      id: 'test',
      title: { fr: 'Test admin', en: 'Test admin en' },
      subtitle: { fr: 'Test admin subtitle', en: 'Test admin subtitle en' },
      iframe: 'https://koumoul.com',
      icon: 'M3.9,12C3.9,10.29 5.29,8.9 7,8.9H11V7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H11V15.1H7C5.29,15.1 3.9,13.71 3.9,12M8,13H16V11H8V13M17,7H13V8.9H17C18.71,8.9 20.1,10.29 20.1,12C20.1,13.71 18.71,15.1 17,15.1H13V17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7Z',
    }
  ],
  extraDocLinks: [
    {
      title: 'Manuel utilisateur',
      href: 'https://docs.koumoul.com/',
      icon: 'M12 21.5C10.65 20.65 8.2 20 6.5 20C4.85 20 3.15 20.3 1.75 21.05C1.65 21.1 1.6 21.1 1.5 21.1C1.25 21.1 1 20.85 1 20.6V6C1.6 5.55 2.25 5.25 3 5C4.11 4.65 5.33 4.5 6.5 4.5C8.45 4.5 10.55 4.9 12 6C13.45 4.9 15.55 4.5 17.5 4.5C18.67 4.5 19.89 4.65 21 5C21.75 5.25 22.4 5.55 23 6V20.6C23 20.85 22.75 21.1 22.5 21.1C22.4 21.1 22.35 21.1 22.25 21.05C20.85 20.3 19.15 20 17.5 20C15.8 20 13.35 20.65 12 21.5M12 8V19.5C13.35 18.65 15.8 18 17.5 18C18.7 18 19.9 18.15 21 18.5V7C19.9 6.65 18.7 6.5 17.5 6.5C15.8 6.5 13.35 7.15 12 8M13 11.5C14.11 10.82 15.6 10.5 17.5 10.5C18.41 10.5 19.26 10.59 20 10.78V9.23C19.13 9.08 18.29 9 17.5 9C15.73 9 14.23 9.28 13 9.84V11.5M17.5 11.67C15.79 11.67 14.29 11.93 13 12.46V14.15C14.11 13.5 15.6 13.16 17.5 13.16C18.54 13.16 19.38 13.24 20 13.4V11.9C19.13 11.74 18.29 11.67 17.5 11.67M20 14.57C19.13 14.41 18.29 14.33 17.5 14.33C15.67 14.33 14.17 14.6 13 15.13V16.82C14.11 16.16 15.6 15.83 17.5 15.83C18.54 15.83 19.38 15.91 20 16.07V14.57Z'
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
