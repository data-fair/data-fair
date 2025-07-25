// use this host when debugging a data-fair inside a virtualbox vm
// in this case docker compose.yml also needs a few modifications
// const host = '10.0.2.2'
const host = 'localhost'

module.exports = {
  port: 5599,
  serveUi: false, // if true, comment the /data-fair/next-ui block in nginx.conf
  dataDir: '../data/development',
  publicUrl: `http://${host}:5600/data-fair`,
  wsPublicUrl: `ws://${host}:5600/data-fair`,
  directoryUrl: `http://${host}:5600/simple-directory`,
  privateDirectoryUrl: 'http://localhost:5600/simple-directory',
  openapiViewerUrl: `http://${host}:5600/openapi-viewer/`,
  captureUrl: `http://${host}:5600/capture`,
  privateCaptureUrl: 'http://localhost:8087',
  privateCatalogsUrl: `http://${host}:5600/catalogs`,
  // notifyUrl: `http://${host}:5600/notify`,
  // privateNotifyUrl: 'http://localhost:8088',
  // notifyWSUrl: 'ws://localhost:8088',
  privateEventsUrl: 'http://localhost:8088',
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
    spawnTask: false
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
      iframe: `http://${host}:5600/data-fair/_dev/extra`,
      basePath: '/data-fair',
      icon: 'mdi-link'
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
  elasticsearch: {
    // searchTimeout: '2s'
    acceptYellowStatus: true
  },
  clamav: {
    active: true,
    dataDir: '/data/data-fair/development'
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
  compatODS: true,
  openapiViewerV2: true
}
