const dbUtils = require('../server/utils/db')
const datasetUtils = require('../server/utils/dataset')
async function main() {
  const { db } = await dbUtils.connect()
  const quotas = await db.collection('quotas').find({}).limit(10000).toArray()
  for (let quota of quotas) {
    await datasetUtils.updateStorageSize(db, quota)
  }
}

main().then(() => process.exit(), err => {
  console.error(err)
  process.exit(-1)
})
