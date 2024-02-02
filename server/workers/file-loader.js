exports.process = async function (app, dataset) {
  const fs = require('fs-extra')
  const datasetUtils = require('../datasets/utils')
  const datasetsService = require('../datasets/service')
  const { basicTypes } = require('./converter')
  const datasetFileSample = require('../datasets/utils/file-sample')
  const chardet = require('chardet')
  const md5File = require('md5-file')

  const debug = require('debug')(`worker:file-loader:${dataset.id}`)
  // const db = app.get('db')

  exports.eventsPrefix = 'load'

  const patch = { loadingFile: null }
  const file = dataset.loadingFile

  const loadingDir = datasetUtils.loadingDir(dataset)
  const loadingFilePath = datasetUtils.loadingFilePath(dataset)
  file.md5 = await md5File(loadingFilePath)
  const fileSample = await datasetFileSample(loadingFilePath)
  debug(`Attempt to detect encoding from ${fileSample.length} first bytes of file ${loadingFilePath}`)
  file.encoding = chardet.detect(fileSample)
  debug(`Detected encoding ${file.encoding} for file ${loadingFilePath}`)

  if (!basicTypes.includes(file.mimetype)) {
    // we first need to convert the file in a textual format easy to index
    patch.originalFile = file
    patch.status = 'stored'
  } else {
    // The format of the original file is already well suited to workers
    patch.originalFile = file
    patch.file = file
    patch.status = 'normalized'
  }

  await fs.move(loadingFilePath, datasetUtils.originalFilePath({ ...dataset, ...patch }), { overwrite: true })
  /* TODO
  if (attachmentsFile) {
    await attachments.replaceAllAttachments({ ...dataset, ...patch }, attachmentsFile)
  } */

  await fs.remove(loadingDir)

  await datasetsService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset)
  debug('done')
}
