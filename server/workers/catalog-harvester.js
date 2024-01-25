const observe = require('../misc/utils/observe')

exports.process = async function (app, catalog) {
  const config = /** @type {any} */(require('config'))
  const CronJob = require('cron').CronJob
  const catalogs = require('../catalogs/plugins')

  const debug = require('debug')(`worker:catalog-harvester:${catalog.id}`)
  const db = app.get('db')
  const date = new Date()

  const patch = { autoUpdate: JSON.parse(JSON.stringify(catalog.autoUpdate || {})) }
  patch.autoUpdate.lastUpdate = { date }

  try {
    await catalogs.updateAllHarvestedDatasets(app, catalog)
  } catch (err) {
    observe.internalError.inc({ errorCode: 'catalog-harvester' })
    console.error('(rest-exporter) failure in rest exporter', err)
    patch.autoUpdate.lastUpdate.error = err.message
  }

  const job = new CronJob(config.catalogAutoUpdates.cron, () => {})
  patch.autoUpdate.nextUpdate = job.nextDates().toISOString()

  await db.collection('catalogs').updateOne({ id: catalog.id }, { $set: patch })
  debug('done')
}
