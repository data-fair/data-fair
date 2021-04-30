const restDatasetsUtils = require('../../../server/utils/rest-datasets')

exports.description = 'fix wrong index on rest dataset'

exports.exec = async (db, debug) => {
  const cursor = db.collection('datasets').find({ isRest: true })
  debug('loop on datasets to recreate indexes')
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    debug('work on dataset', dataset.id)
    const collection = restDatasetsUtils.collection(db, dataset)
    try {
      await collection.dropIndex('_updatedAt_1')
      await collection.dropIndex('_deleted_1')
    } catch (err) {
      debug('failed to delete previous index', err.message)
    }
    await collection.createIndex({ _needsIndexing: 1 })
  }
}
