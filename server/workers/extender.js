// Index tabular datasets with elasticsearch using available information on dataset schema
const extensionsUtils = require('../utils/extensions')

exports.eventsPrefix = 'extend'

exports.process = async function(app, dataset) {
  const debug = require('debug')(`worker:extender:${dataset.id}`)

  const db = app.get('db')
  const collection = db.collection('datasets')

  debug('apply extensions', dataset.extensions)
  await extensionsUtils.extend(app, dataset, dataset.extensions || [])
  debug('extensions ok')

  const result = { status: 'extended' }
  // TODO: implement updated-extended status ?
  Object.assign(dataset, result)
  await collection.updateOne({ id: dataset.id }, { $set: result })
  debug('done')
}
