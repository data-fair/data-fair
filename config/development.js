module.exports = {
  port: 5600,
  publicUrl: 'http://localhost:5600',
  wsPublicUrl: 'ws://localhost:5600',
  dataDir: './data/development',
  directoryUrl: 'http://localhost:5600/simple-directory',
  openapiViewerUrl: 'http://localhost:5600/openapi-viewer/',
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
    ownerNames: 'dev_secret'
  },
  cache: {
    disabled: true
  },
  browserLogLevel: 'debug',
  catalogs: [{
    title: 'Data.gouv.fr',
    href: 'https://www.data.gouv.fr'
  }, {
    title: 'Mydatacatalogue',
    href: 'https://mydatacatalogue.fr'
  }]
}
