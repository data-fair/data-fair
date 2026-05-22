// load .env from the project root before development.cjs runs its DEV_API_PORT check
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

// dev-benchmark mode: behaves like the development environment, but with relaxed
// storage and rate limits so the benchmark harness (../../benchmark) can seed and
// query large datasets. (The former `test.cjs` base was removed with the test-suite
// refactor; development.cjs is the dev-environment base now.)
const development = require('./development.cjs')

module.exports = {
  ...development,
  // Isolate benchmark data from the regular dev environment: a separate mongo db and
  // data dir, so dev-benchmark and dev-api never share/corrupt dataset state. (The ES
  // index prefix is already `dataset-benchmark` via NODE_ENV — see default.cjs.)
  dataDir: '../data/benchmark',
  mongo: {
    ...development.mongo,
    url: `mongodb://localhost:${process.env.MONGO_PORT}/data-fair-benchmark`,
    maxBulkOps: 1000
  },
  defaultLimits: {
    ...development.defaultLimits,
    totalStorage: 10000000000,
    datasetStorage: 10000000000,
    nbDatasets: 100,
    apiRate: {
      ...development.defaultLimits.apiRate,
      anonymous: { ...development.defaultLimits.apiRate.anonymous, nb: 100000 },
      user: { ...development.defaultLimits.apiRate.user, nb: 100000 }
    }
  }
}
