module.exports = {
  port: 5800,
  defaultLimits: {
    totalStorage: 15000,
    datasetStorage: 10000
  },
  workers: {
    concurrency: 1,
    pollingInterval: 1
  },
  locks: {
    // in seconds
    ttl: 0.1
  },
  defaultRemoteKey: 'test_default_key',
  nuxtBuild: {
    active: false
  }
}
