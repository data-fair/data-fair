const slug = require('slugify')

exports.description = 'Only one instance of remote service per data-fair install instead of per owner.'

exports.exec = async (db, debug) => {
  try {
    await db.collection('remote-services').dropIndex('fulltext')
  } catch (err) {
  // nothing to do
  }
  const servicesCursor = db.collection('remote-services').find()
  const idsMap = {}
  while (await servicesCursor.hasNext()) {
    const remoteService = await servicesCursor.next()
    const sharedServiceId = slug(remoteService.apiDoc.info['x-api-id'])
    debug(`Replace remote service ${remoteService.id} with ${sharedServiceId}`)
    idsMap[remoteService.id] = sharedServiceId
  }

  const datasetsCursor = db.collection('datasets').find()
  while (await datasetsCursor.hasNext()) {
    const dataset = await datasetsCursor.next()
    const extensions = (dataset.extensions || []).filter(e => !!idsMap[e.remoteService])
    extensions.forEach(e => {
      e.remoteService = idsMap[e.remoteService]
    })
    await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { extensions } })
  }

  // Actually do not delete right away to preserve previous app configurations
  // await db.collection('remote-services').deleteMany()
}
