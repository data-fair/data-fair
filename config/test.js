module.exports = {
  port: 5599,
  publicUrl: 'http://localhost:5600/data-fair',
  wsPublicUrl: 'ws://localhost:5600/data-fair',
  directoryUrl: 'http://localhost:5600/simple-directory',
  privateDirectoryUrl: 'http://localhost:5600/simple-directory',
  openapiViewerUrl: 'http://localhost:5600/api-doc/',
  captureUrl: 'http://localhost:5600/capture',
  privateCaptureUrl: 'http://localhost:8087',
  dataDir: './data/test',
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
    interval: 10,
    concurrency: 1,
    spawnTask: false,
    errorRetryDelay: 0
  },
  mongo: {
    maxBulkOps: 100
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
    limits: 'limits-test-key'
  },
  nuxtBuild: {
    active: false
  },
  applications: [{
    title: 'App test1',
    url: 'http://monapp1.com',
    public: true
  }, {
    title: 'App test2',
    url: 'http://monapp2.com'
  }],
  remoteServices: [{
    title: 'Geocoder',
    url: 'http://test.com/geocoder/api-docs.json'
  }, {
    title: 'Sirene',
    url: 'http://test.com/sirene/api-docs.json'
  }],
  observer: {
    port: 9092
  },
  cache: {
    // set cache-control max-age for public GET endpoints (in seconds)
    publicMaxAge: 1
  },
  clamav: {
    active: false,
    dataDir: '/data/data-fair/test'
  },
  assertImmutable: true,
  remoteAttachmentCacheDuration: 1000
}
