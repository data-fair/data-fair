module.exports = {
  port: 5800,
  defaultLimits: {
    totalStorage: 1500,
    datasetStorage: 1000
  },
  workersPollingIntervall: 1,
  locks: {
    // in seconds
    ttl: 0.1
  }
}
