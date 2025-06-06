// Index tabular datasets with elasticsearch using available information on dataset schema
import extensionsUtils from '../misc/utils/extensions.ts'
import * as datasetUtils from '../datasets/utils/index.js'
import debugLib from 'debug'
import mongo from '#mongo'

export const eventsPrefix = 'extend'

export const process = async function (app, dataset) {
  const debug = debugLib(`worker:extender:${dataset.id}`)

  const db = mongo.db
  const collection = db.collection('datasets')

  // Perform all extensions with remote services.
  debug('extensions', dataset.extensions)
  const extensions = dataset.extensions || []
  for (const extension of extensions) {
    if (!extension.active) continue
    const remoteService = await db.collection('remote-services').findOne({ id: extension.remoteService })
    if (!remoteService) {
      console.warn(`Try to apply extension on dataset ${dataset.id} from remote service ${remoteService.id} but remote service ${extension.action} was not found.`)
      continue
    }
    const action = remoteService.actions.find(a => a.id === extension.action)
    if (!action) {
      console.warn(`Try to apply extension on dataset ${dataset.id} from remote service ${remoteService.id} but action ${extension.action} was not found.`)
      continue
    }
    debug('apply extension', extension)
    await extensionsUtils.extend(dataset, extension, remoteService, action)
    debug('extension ok')
  }

  if (!dataset.isRest) {
    debug('write full version of the file')
    await datasetUtils.writeFullFile(mongo.db, app.get('es'), dataset)
  }

  const result = { status: 'extended' }
  Object.assign(dataset, result)
  await collection.updateOne({ id: dataset.id }, { $set: result })
  debug('done')
}
