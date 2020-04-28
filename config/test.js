module.exports = {
  port: 4657,
  publicUrl: 'http://localhost:4657',
  wsPublicUrl: 'ws://localhost:4657',
  dataDir: './data/test',
  brand: {
    embed: '<div>application embed</div>'
  },
  defaultLimits: {
    totalStorage: 20000,
    datasetStorage: 16000,
    remoteServiceRate: {
      duration: 1,
      nb: 10,
      kb: 50
    }
  },
  worker: {
    interval: 40,
    releaseInterval: 10,
    concurrency: 1,
    spawnTask: false
  },
  locks: {
    // in seconds
    ttl: 0.1
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
  }]
}
