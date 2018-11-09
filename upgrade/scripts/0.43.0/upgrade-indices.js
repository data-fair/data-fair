const esUtils = require('../../../server/utils/es')

exports.description = `ES indices structure changed since previous version and everything has to be upgraded.`

exports.exec = async (db, debug) => {
  const esClient = await esUtils.init()
  const cursor = await db.collection('datasets').find({})
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    debug('Upgrade ES index definition for dataset ' + dataset.id)
    if (!dataset.isVirtual) {
      try {
        await esUtils.updateDatasetMapping(esClient, dataset)
      } catch (err) {
        console.error(`Failed to upgrade mapping for dataset ${dataset.id}`, err)
      }
    }
  }
  await esClient.close()
}
