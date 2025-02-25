import fs from 'fs-extra'
import config from '#config'
import tmp from 'tmp-promise'
import { CronJob } from 'cron'
import pump from '../misc/utils/pipe.js'
import * as restUtils from '../datasets/utils/rest.js'
import * as outputs from '../datasets/utils/outputs.js'
import * as datasetUtils from '../datasets/utils/index.js'
import * as datasetsService from '../datasets/service.js'
import { tmpDir } from '../datasets/utils/files.ts'
import debugLib from 'debug'
import { internalError } from '@data-fair/lib-node/observer.js'
import mongo from '#mongo'

export const process = async function (app, dataset) {
  const debug = debugLib(`worker:rest-exporter-csv:${dataset.id}`)
  const db = mongo.db
  const date = new Date()
  const patch = { exports: JSON.parse(JSON.stringify(dataset.exports)) }
  patch.exports.restToCSV.lastExport = { date }
  try {
    const tmpFile = await tmp.tmpName({ tmpdir: tmpDir, prefix: 'rest-exporter-csv-' })
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
    internalError('rest-exporter', err)
    patch.exports.restToCSV.lastExport.error = err.message
  }

  const job = new CronJob(config.exportRestDatasets.cron, () => {})
  patch.exports.restToCSV.nextExport = job.nextDate().toISO()

  await datasetsService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset, false, true)
  debug('done')
}
