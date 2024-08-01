exports.description = 'Re-calculate esWarning, some bad values were stored.'

const esUtils = require('../../../server/datasets/es')

exports.exec = async (db, debug) => {
  const esClient = await esUtils.init()
  for await (const dataset of db.collection('datasets').find({ esWarning: { $exists: true, $ne: null } })) {
    const esWarning = await esUtils.datasetWarning(esClient, dataset)
    if (dataset.esWarning !== esWarning) {
      debug('reset esWarning', dataset.id, dataset.slug, esWarning)
      await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { esWarning } })
    }
  }
}
