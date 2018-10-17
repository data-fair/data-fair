// Index tabular datasets with elasticsearch using available information on dataset schema
const extensionsUtils = require('../utils/extensions')

exports.type = 'dataset'
exports.eventsPrefix = 'extend'

// Indexed and at least one active extension
exports.filter = { status: 'indexed', 'extensions.active': true }

exports.process = async function(app, dataset) {
  const debug = require('debug')(`worker:finalizer:${dataset.id}`)

  const db = app.get('db')
  const collection = db.collection('datasets')

  // Perform all extensions with remote services.
  debug('extensions', dataset.extensions)
  const extensions = dataset.extensions || []
  for (let extension of extensions) {
    if (!extension.active) continue
    const remoteService = await db.collection('remote-services').findOne({ id: extension.remoteService })
    if (!remoteService) continue
    // TODO: check that owner can use remoteservice event if not owner ?
    if (dataset.owner.type !== remoteService.owner.type || dataset.owner.id !== remoteService.owner.id) {
      console.error(`Try to apply extension on dataset ${dataset.id} from remote service ${remoteService.id} but they do not have the same owner.`)
      continue
    }
    const action = remoteService.actions.find(a => a.id === extension.action)
    if (!action) {
      console.error(`Try to apply extension on dataset ${dataset.id} from remote service ${remoteService.id} but action ${extension.action} was not found.`)
      continue
    }
    debug('apply extension', extension)
    await extensionsUtils.extend(app, dataset, extension, remoteService, action)
    debug('extension ok')
  }

  const result = { status: 'extended' }
  Object.assign(dataset, result)
  await collection.updateOne({ id: dataset.id }, { $set: result })
  debug('done')
}
