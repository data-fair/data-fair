const datasetUtils = require('../../../server/utils/dataset')

exports.description = 'replace extras.reuses by extras.applications'

exports.exec = async (db, debug) => {
  for await (const dataset of db.collection('datasets').find({ 'extras.applications': { $exists: false } })) {
    debug(`${dataset.id} - transform extras.reuses ${JSON.stringify(dataset?.extras?.reuses)} into extras.applications`)
    await db.collection('datasets').updateOne(
      { id: dataset.id },
      { $set: { 'extras.applications': (dataset?.extras?.reuses || []).map(id => ({ id })) } }
    )
    await datasetUtils.syncApplications(db, dataset.id)
  }
}
