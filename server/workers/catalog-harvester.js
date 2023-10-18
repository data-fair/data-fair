const prometheus = require('../utils/prometheus')

exports.process = async function (app, catalog) {
  const config = require('config')
  const CronJob = require('cron').CronJob
  const catalogs = require('../catalogs')

  const debug = require('debug')(`worker:catalog-harvester:${catalog.id}`)
  const db = app.get('db')
  const date = new Date()

  const patch = { autoUpdate: JSON.parse(JSON.stringify(catalog.autoUpdate || {})) }
  patch.autoUpdate.lastUpdate = { date }

  try {
    await catalogs.updateAllHarvestedDatasets(app, catalog)
  } catch (err) {
    prometheus.internalError.inc({ errorCode: 'catalog-harvester' })
    console.error('(rest-exporter) failure in rest exporter', err)
    patch.autoUpdate.lastUpdate.error = err.message
  }

  const job = new CronJob(config.catalogAutoUpdates.cron, () => {})
  patch.autoUpdate.nextUpdate = job.nextDates().toISOString()

  await db.collection('catalogs').updateOne({ id: catalog.id }, { $set: patch })
  debug('done')
}
