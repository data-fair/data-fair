const dbUtils = require('../server/utils/db')
const datasetUtils = require('../server/utils/dataset')
async function main() {
  const { db } = await dbUtils.init()
  const quotas = await db.collection('quotas').find({}).limit(10000).toArray()
  for (let quota of quotas) {
    await datasetUtils.updateStorageSize(db, quota.owner)
  }
}

main().then(() => process.exit())
