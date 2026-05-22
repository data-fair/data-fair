// load .env from the project root before development.cjs runs its DEV_API_PORT check
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

// dev-benchmark mode: behaves like the development environment, but with relaxed
// storage and rate limits so the benchmark harness (../../benchmark) can seed and
// query large datasets. (The former `test.cjs` base was removed with the test-suite
// refactor; development.cjs is the dev-environment base now.)
const development = require('./development.cjs')

module.exports = {
  ...development,
  mongo: { ...development.mongo, maxBulkOps: 1000 },
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
