module.exports = {
  port: 5599,
  publicUrl: 'http://localhost:5600/data-fair',
  wsPublicUrl: 'ws://localhost:5600/data-fair',
  directoryUrl: 'http://localhost:5600/simple-directory',
  privateDirectoryUrl: 'http://localhost:5600/simple-directory',
  openapiViewerUrl: 'http://localhost:5600/openapi-viewer/',
  captureUrl: 'http://localhost:5600/capture',
  privateCaptureUrl: 'http://localhost:8087',
  notifyUrl: 'http://localhost:5600/notify',
  privateNotifyUrl: 'http://localhost:8088',
  notifyWSUrl: 'ws://localhost:8088',
  thumbor: {
    url: 'http://localhost:8000',
    key: 'thumborkey'
  },
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
      }
    }
  },
  worker: {
    interval: 10,
    inactiveInterval: 0,
    concurrency: 1,
    spawnTask: false
  },
  mongo: {
    maxBulkOps: 100
  },
  locks: {
    // in seconds
    ttl: 0.1
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
  prometheus: {
    port: 9092
  }
}
