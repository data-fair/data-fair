import mongo from '#mongo'
import * as datasetUtils from '../src/datasets/utils/index.js'

async function main () {
  await mongo.connect()
  const db = mongo.db
  const cursor = await db.collection('datasets').find({})
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    if (dataset?.status === 'error') {
      await datasetUtils.reindex(db, dataset)
    }
  }
}

main().then(() => process.exit(), err => {
  console.error(err)
  process.exit(-1)
})
