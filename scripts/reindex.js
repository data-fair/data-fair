const dbUtils = require('../server/misc/utils/db')
const datasetUtils = require('../server/datasets/utils')
async function main () {
  const { db } = await dbUtils.connect()
  const cursor = await db.collection('datasets').find({})
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    await datasetUtils.reindex(db, dataset)
  }
}

main().then(() => process.exit(), err => {
  console.error(err)
  process.exit(-1)
})
