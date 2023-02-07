const prometheus = require('../utils/prometheus')

exports.process = async function (app, dataset) {
  const path = require('path')
  const util = require('util')
  const fs = require('fs-extra')
  const config = require('config')
  const tmp = require('tmp-promise')
  const CronJob = require('cron').CronJob
  const pump = util.promisify(require('pump'))
  const restUtils = require('../utils/rest-datasets')
  const outputs = require('../utils/outputs')
  const datasetUtils = require('../utils/dataset')

  const dataDir = path.resolve(config.dataDir)
  const debug = require('debug')(`worker:rest-exporter-csv:${dataset.id}`)
  const db = app.get('db')
  const date = new Date()
  const patch = { exports: JSON.parse(JSON.stringify(dataset.exports)) }
  patch.exports.restToCSV.lastExport = { date }
  try {
    const tmpFile = await tmp.tmpName({ dir: path.join(dataDir, 'tmp') })
    // creating empty file before streaming seems to fix some weird bugs with NFS
    await fs.ensureFile(tmpFile)
    debug('write into file', tmpFile)
    await pump(
      ...await restUtils.readStreams(db, dataset),
      ...outputs.result2csv(dataset),
      fs.createWriteStream(tmpFile)
    )

    const exportedFile = datasetUtils.exportedFilePath(dataset, '.csv')
    debug('mode to file', exportedFile)
    await fs.move(tmpFile, exportedFile, { overwrite: true })
  } catch (err) {
    prometheus.internalError.inc({ errorCode: 'rest-exporter' })
    console.error('(rest-exporter) failure in rest exporter', err)
    patch.exports.restToCSV.lastExport.error = err.message
  }

  const job = new CronJob(config.exportRestDatasets.cron, () => {})
  patch.exports.restToCSV.nextExport = job.nextDates().toISOString()

  await datasetUtils.applyPatch(db, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(db, dataset, false, true)
  debug('done')
}
