const restDatasetsUtils = require('../../../server/utils/rest-datasets')

exports.description = 'improve indexes on _needsIndexing and _needsExtending for rest datasets'

exports.exec = async (db, debug) => {
  const cursor = db.collection('datasets').find({ isRest: true })
  debug('loop on datasets to recreate indexes')
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    debug('work on dataset', dataset.id)
    const collection = restDatasetsUtils.collection(db, dataset)
    try {
      await collection.dropIndex('_needsIndexing_1')
      await collection.dropIndex('_needsExtending_1')
    } catch (err) {
      debug('failed to delete previous index', err.message)
    }
    await collection.createIndex({ _needsIndexing: 1 }, { sparse: true, name: 'needsIndexing' })
    await collection.createIndex({ _needsExtending: 1 }, { sparse: true, name: 'needsExtending' })
    debug('empty false values of _needsIndexing', (await collection.updateMany({ _needsIndexing: false }, { $unset: { _needsIndexing: '' } })).modifiedCount)
    debug('empty false values of _needsExtending', (await collection.updateMany({ _needsExtending: false }, { $unset: { _needsExtending: '' } })).modifiedCount)
  }
}
