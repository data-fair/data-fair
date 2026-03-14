// load .env from project root before test.cjs tries to
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const test = require('./test.cjs')

module.exports = {
  ...test,
  mongo: { ...test.mongo, maxBulkOps: 1000 },
  defaultLimits: {
    ...test.defaultLimits,
    totalStorage: 10000000000,
    datasetStorage: 10000000000,
    nbDatasets: 100,
    apiRate: {
      ...test.defaultLimits.apiRate,
      anonymous: { ...test.defaultLimits.apiRate.anonymous, nb: 100000 },
      user: { ...test.defaultLimits.apiRate.user, nb: 100000 }
    }
  }
}
