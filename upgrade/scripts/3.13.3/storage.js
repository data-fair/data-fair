const datasetUtils = require('../../../server/utils/dataset')
const esUtils = require('../../../server/utils/es')
exports.description = 'Create "storage" property for all existing datasets.'

exports.exec = async (db, debug) => {
  const esClient = await esUtils.init()
  const cursor = db.collection('datasets').find({})
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    await datasetUtils.updateStaticStorage(db, dataset)
    await datasetUtils.updateDynamicStorage(db, esClient, esUtils.aliasName(dataset), dataset)
  }
}
