// Extend dataset with remote services as appropriate
const extensionsUtils = require('../utils/extensions')
exports.eventsPrefix = 'extend'

exports.filter = {status: 'indexed'}

exports.process = async function(app, dataset) {
  const db = app.get('db')

  const extensions = dataset.extensions || []
  const promises = []
  for (let extension of extensions) {
    const remoteService = await db.collection('remote-services').findOne({id: extension.remoteService})
    if (!remoteService) continue
    // TODO: check that owner can use remoteservice event if not owner ?
    if (dataset.owner.type !== remoteService.owner.type || dataset.owner.id !== remoteService.owner.id) continue
    const action = remoteService.actions.find(a => a.id === extension.action)
    if (!action) continue
    promises.push(extensionsUtils.extend(app, dataset, remoteService, action, true))
  }

  await Promise.all(promises)

  dataset.status = 'extended'
  await db.collection('datasets').updateOne({id: dataset.id}, {
    $set: {
      status: 'extended'
    }
  })
}
