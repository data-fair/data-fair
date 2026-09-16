import mongo from '#mongo'
import * as datasetUtils from '../src/datasets/utils/index.ts'

async function main () {
  await mongo.connect()
  const db = mongo.db
  for await (const dataset of mongo.datasets.find({})) {
    await datasetUtils.reindex(db, dataset)
  }
}

main().then(() => process.exit(), err => {
  console.error(err)
  process.exit(-1)
})
