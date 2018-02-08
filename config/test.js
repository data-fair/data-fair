module.exports = {
  port: 5800,
  defaultLimits: {
    totalStorage: 1500,
    datasetStorage: 1000
  },
  workers: {
    pollingInterval: 1
  },
  locks: {
    // in seconds
    ttl: 0.1
  },
  defaultRemoteKey: 'test_default_key'
}
