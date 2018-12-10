module.exports = {
  defaultLimits: {
    totalStorage: 20000,
    datasetStorage: 16000,
    remoteServiceRate: {
      duration: 1,
      nb: 10,
      kb: 50
    }
  },
  workers: {
    concurrency: 1,
    pollingInterval: 20
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
  secretKeys: {
    identities: 'identities-test-key',
    quotas: 'quotas-test-key'
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
