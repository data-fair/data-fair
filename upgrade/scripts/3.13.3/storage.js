const datasetUtils = require('../../../server/utils/dataset')
const esUtils = require('../../../server/utils/es')
exports.description = 'Create "storage" property for all existing datasets.'

exports.exec = async (db, debug) => {
  const esClient = await esUtils.init()
  const cursor = db.collection('datasets').find({})
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    debug('update storage info of dataset', dataset.id)
    await db.collection('datasets')
      .updateOne({ id: dataset.id }, { $set: { storage: {} } })
    debug('static', await datasetUtils.updateStaticStorage(db, dataset))
    if (dataset.isVirtual || dataset.isMetaOnly) continue
    try {
      debug('dynamic', await datasetUtils.updateDynamicStorage(db, esClient, esUtils.aliasName(dataset), dataset))
    } catch (err) {
      if (err.statusCode !== 404) throw err
      else debug('no ES index for dataset', dataset.id)
    }
  }
}
