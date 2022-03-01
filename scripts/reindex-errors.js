const dbUtils = require('../server/utils/db')
const datasetUtils = require('../server/utils/dataset')
async function main () {
  const { db } = await dbUtils.connect()
  const cursor = await db.collection('datasets').find({})
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    if (dataset.status === 'error') {
      await datasetUtils.reindex(db, dataset)
    }
  }
}

main().then(() => process.exit(), err => {
  console.error(err)
  process.exit(-1)
})
