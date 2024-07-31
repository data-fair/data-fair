exports.description = 'Calculate esWarning.'

const esUtils = require('../../../server/datasets/es')

exports.exec = async (db, debug) => {
  const esClient = await esUtils.init()
  for await (const dataset of db.collection('datasets').find({ esWarning: { $exists: false } })) {
  // for await (const dataset of db.collection('datasets').find()) {
    const esWarning = await esUtils.datasetWarning(esClient, dataset)
    if (dataset.esWarning !== esWarning) {
      debug('set esWarning', dataset.id, dataset.slug, esWarning)
      await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { esWarning } })
    }
  }
}
