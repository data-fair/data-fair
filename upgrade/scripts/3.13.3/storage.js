const datasetUtils = require('../../../server/utils/dataset')
exports.description = 'Recreate "storage" property for all existing datasets.'

exports.exec = async (db, debug) => {
  const cursor = db.collection('datasets').find({})
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    debug('update storage info of dataset', dataset.id)
    await datasetUtils.updateNbDatasets(db, dataset.owner)
    await db.collection('datasets')
      .updateOne({ id: dataset.id }, { $set: { storage: {} } })
    console.log(await datasetUtils.updateStorage(db, dataset))
  }
}
