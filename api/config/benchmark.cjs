// benchmark environment: same infrastructure/ports as development (.env) but an
// isolated mongo db, data dir and ES prefix (indicesPrefix follows NODE_ENV),
// production-like single-line refresh behavior, and limits raised high enough
// that the platform, not the rate limiter, is what gets measured

// load .env from the repo root explicitly: development.cjs resolves it from cwd,
// which only works inside the dotenv-wrapped zellij session
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env'), quiet: true })

const development = require('./development.cjs')

const noBandwidthLimit = { dynamic: 10000000000, static: 10000000000 }

module.exports = {
  ...development,
  dataDir: '../data/benchmark',
  tmpDir: '../data/benchmark-tmp',
  mongo: {
    ...development.mongo,
    url: `mongodb://localhost:${process.env.MONGO_PORT}/data-fair-benchmark`,
    maxBulkOps: 1000
  },
  elasticsearch: {
    ...development.elasticsearch,
    // production default, deliberate: perf finding T12 measures the cost of wait_for
    singleLineOpRefresh: 'wait_for'
  },
  worker: {
    ...development.worker,
    interval: 150
  },
  observer: {
    active: true,
    port: process.env.DEV_OBSERVER_PORT
  },
  defaultLimits: {
    ...development.defaultLimits,
    totalStorage: 10000000000,
    datasetStorage: 10000000000,
    nbDatasets: 100,
    apiRate: {
      ...development.defaultLimits.apiRate,
      // computeMs: 0 must stay explicit, the production default would re-enable compute budgets
      anonymous: { duration: 1, nb: 100000, computeMs: 0, bandwidth: noBandwidthLimit },
      user: { duration: 1, nb: 100000, computeMs: 0, bandwidth: noBandwidthLimit }
    }
  }
}
