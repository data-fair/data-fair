const restDatasetsUtils = require('../../../server/utils/rest-datasets')

exports.description = 'add index on _needsExtending for rest datasets'

exports.exec = async (db, debug) => {
  const cursor = db.collection('datasets').find({ isRest: true })
  debug('loop on datasets to recreate indexes')
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    debug('work on dataset', dataset.id)
    const collection = restDatasetsUtils.collection(db, dataset)
    await collection.createIndex({ _needsExtending: 1 })
  }
}
