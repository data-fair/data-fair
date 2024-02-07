exports.process = async function (app, dataset) {
  const observe = require('../misc/utils/observe')
  const fs = require('fs-extra')
  const config = require('config')
  const tmp = require('tmp-promise')
  const CronJob = require('cron').CronJob
  const pump = require('../misc/utils/pipe')
  const restUtils = require('../datasets/utils/rest')
  const outputs = require('../datasets/utils/outputs')
  const datasetUtils = require('../datasets/utils')
  const datasetsService = require('../datasets/service')
  const { tmpDir } = require('../datasets/utils/files')

  const debug = require('debug')(`worker:rest-exporter-csv:${dataset.id}`)
  const db = app.get('db')
  const date = new Date()
  const patch = { exports: JSON.parse(JSON.stringify(dataset.exports)) }
  patch.exports.restToCSV.lastExport = { date }
  try {
    const tmpFile = await tmp.tmpName({ dir: tmpDir })
    // creating empty file before streaming seems to fix some weird bugs with NFS
    await fs.ensureFile(tmpFile)
    debug('write into file', tmpFile)
    await pump(
      ...await restUtils.readStreams(db, dataset),
      ...outputs.csvStreams(dataset),
      fs.createWriteStream(tmpFile)
    )

    const exportedFile = datasetUtils.exportedFilePath(dataset, '.csv')
    debug('mode to file', exportedFile)
    await fs.move(tmpFile, exportedFile, { overwrite: true })
  } catch (err) {
    observe.internalError.inc({ errorCode: 'rest-exporter' })
    console.error('(rest-exporter) failure in rest exporter', err)
    patch.exports.restToCSV.lastExport.error = err.message
  }

  const job = new CronJob(config.exportRestDatasets.cron, () => {})
  patch.exports.restToCSV.nextExport = job.nextDates().toISOString()

  await datasetsService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset, false, true)
  debug('done')
}
