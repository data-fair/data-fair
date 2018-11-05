module.exports = {
  defaultLimits: {
    totalStorage: 20000,
    datasetStorage: 15000
  },
  workers: {
    concurrency: 1,
    pollingInterval: 10
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
  }]
}
