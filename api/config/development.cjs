// use this host when debugging a data-fair inside a virtualbox vm
// in this case docker compose.yml also needs a few modifications

if (!process.env.WORKTREE) throw new Error('missing WORKTREE env variable, use "source dev/env.sh" to load env vars')

module.exports = {
  port: 5599,
  dataDir: '../data/development',
  mongo: {
    url: `mongodb://localhost:${process.env.MONGO_PORT}/data-fair-development`,
  },
  elasticsearch: {
    host: `localhost:${process.env.ES_PORT}`,
    // searchTimeout: '2s'
    acceptYellowStatus: true
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
  // privateCatalogsUrl: `http://${host}:5600/catalogs`,
  privateEventsUrl: `http://localhost:${process.env.EVENTS_PORT}`,
  // subscriptionUrl: 'https://staging-koumoul.com/s/customers/embed/subscription',
  defaultLimits: {
    totalStorage: 10000000000,
    totalIndexed: 10000000000,
    nbDatasets: 1000
    // datasetStorage: -1,
  },
  locks: {
    // in seconds
    ttl: 4
  },
  /* For virtual box debugging
  publicUrl: 'http://10.0.2.2:5600',
  wsPublicUrl: 'ws://10.0.2.2:5600',
  directoryUrl: 'https://staging.koumoul.com',
  */
  secretKeys: {
    identities: 'dev_secret',
    events: 'secret-notifications',
    catalogs: 'secret-catalogs'
  },
  cache: {
    disabled: true
  },
  worker: {
    closeTimeout: 1000
  },
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
  clamav: {
    active: true,
    dataDir: '/data/data-fair/development',
    port: process.env.CLAMAV_PORT,
  },
  assertImmutable: true,
  agentkeepaliveOptions: {
    keepAlive: false
  },
  remoteServices: [{
    title: 'Service de données cartographiques',
    id: 'tileserver-koumoul',
    description: 'Ce service expose les données cartographiques traitées par Koumoul sous divers formats standards.',
    server: 'https://staging-koumoul.com/tileserver'
  }],
  compatODS: true
}
