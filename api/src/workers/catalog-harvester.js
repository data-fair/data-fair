import config from '#config'
import mongo from '#mongo'
import debugLib from 'debug'
import { CronJob } from 'cron'
import * as catalogs from '../catalogs/plugins/index.js'
import { internalError } from '@data-fair/lib-node/observer.js'

export const process = async function (app, catalog) {
  const debug = debugLib(`worker:catalog-harvester:${catalog.id}`)
  const db = mongo.db
  const date = new Date()

  const patch = { autoUpdate: JSON.parse(JSON.stringify(catalog.autoUpdate || {})) }
  patch.autoUpdate.lastUpdate = { date }

  try {
    await catalogs.updateAllHarvestedDatasets(app, catalog)
  } catch (err) {
    internalError('catalog-harvester', err)
    patch.autoUpdate.lastUpdate.error = err.message
  }

  const job = new CronJob(config.catalogAutoUpdates.cron, () => {})
  patch.autoUpdate.nextUpdate = job.nextDate().toISO()

  await db.collection('catalogs').updateOne({ id: catalog.id }, { $set: patch })
  debug('done')
}
