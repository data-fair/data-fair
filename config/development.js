// use this host when debugging a data-fair inside a virtualbox vm
// in this case docker-compose.yml also needs a few modifications
// const host = '10.0.2.2'
const host = 'localhost'

module.exports = {
  port: 5600,
  dataDir: './data/development',
  publicUrl: `http://${host}:5600`,
  wsPublicUrl: `ws://${host}:5600`,
  directoryUrl: `http://${host}:5600/simple-directory`,
  privateDirectoryUrl: 'http://localhost:5600/simple-directory',
  openapiViewerUrl: `http://${host}:5600/openapi-viewer/`,
  captureUrl: `http://${host}:5600/capture`,
  defaultLimits: {
    totalStorage: 1000000000,
    datasetStorage: -1
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
    identities: 'dev_secret'
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
  }]
}
