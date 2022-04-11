const dbUtils = require('../server/utils/db')
const datasetUtils = require('../server/utils/dataset')
const limits = require('../server/utils/limits')
async function main () {
  const { db } = await dbUtils.connect()
  for await (const limit of db.collection('limits').find({})) {
    const totalStorage = await datasetUtils.totalStorage(db, limit)
    console.log(`reinit consumption of ${limit.type} / ${limit.id}`, totalStorage)
    await limits.setConsumption(db, limit, 'store_bytes', totalStorage.size)
    await limits.setConsumption(db, limit, 'indexed_bytes', totalStorage.indexed)
  }
}

main().then(() => process.exit(), err => {
  console.error(err)
  process.exit(-1)
})
