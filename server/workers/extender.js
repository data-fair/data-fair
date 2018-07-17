// Index tabular datasets with elasticsearch using available information on dataset schema
const extensionsUtils = require('../utils/extensions')

exports.type = 'dataset'
exports.eventsPrefix = 'extend'

// Indexed and at least one active extension
exports.filter = {status: 'indexed', 'extensions.active': true}

exports.process = async function(app, dataset) {
  const db = app.get('db')
  const collection = db.collection('datasets')

  // Perform all extensions with remote services.
  // the "extendStream" used in indexer was simply to preserve extensions from previous indexing tasks
  const extensions = dataset.extensions || []
  const extensionsPromises = []
  for (let extension of extensions) {
    if (!extension.active) continue
    const remoteService = await db.collection('remote-services').findOne({id: extension.remoteService})
    if (!remoteService) continue
    // TODO: check that owner can use remoteservice event if not owner ?
    if (dataset.owner.type !== remoteService.owner.type || dataset.owner.id !== remoteService.owner.id) continue
    const action = remoteService.actions.find(a => a.id === extension.action)
    if (!action) continue
    extensionsPromises.push(extensionsUtils.extend(app, dataset, extension, remoteService, action))
  }
  await Promise.all(extensionsPromises)

  const result = {status: 'extended'}
  Object.assign(dataset, result)
  await collection.updateOne({id: dataset.id}, {$set: result})
}
