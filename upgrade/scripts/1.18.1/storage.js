const datasetUtils = require('../../../server/utils/dataset')

exports.description = 'Create "storage" property for all existing datasets.'

exports.exec = async (db, debug) => {
  const cursor = db.collection('datasets').find({})
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    await datasetUtils.updateStorage(db, dataset)
  }
}
