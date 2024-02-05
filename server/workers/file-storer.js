exports.eventsPrefix = 'load'

exports.process = async function (app, dataset) {
  const fs = require('fs-extra')
  const datasetUtils = require('../datasets/utils')
  const datasetsService = require('../datasets/service')
  const { replaceAllAttachments } = require('../datasets/utils/attachments')
  const { basicTypes } = require('./converter')
  const datasetFileSample = require('../datasets/utils/file-sample')
  const chardet = require('chardet')
  const md5File = require('md5-file')

  const debug = require('debug')(`worker:file-storer:${dataset.id}`)
  // const db = app.get('db')

  const patch = { loadedFile: null }
  const file = dataset.loadedFile

  const loadingDir = datasetUtils.loadingDir(dataset)
  const loadedFilePath = datasetUtils.loadedFilePath(dataset)
  file.md5 = await md5File(loadedFilePath)
  const fileSample = await datasetFileSample(loadedFilePath)
  debug(`Attempt to detect encoding from ${fileSample.length} first bytes of file ${loadedFilePath}`)
  file.encoding = chardet.detect(fileSample)
  debug(`Detected encoding ${file.encoding} for file ${loadedFilePath}`)

  patch.originalFile = file
  patch.status = 'stored'
  if (basicTypes.includes(file.mimetype)) {
    patch.file = patch.originalFile
  }

  const newFilePath = datasetUtils.originalFilePath({ ...dataset, ...patch })
  await fs.move(loadedFilePath, newFilePath, { overwrite: true })
  if (dataset.originalFile) {
    const oldFilePath = datasetUtils.originalFilePath(dataset)
    if (oldFilePath !== newFilePath) await fs.remove(oldFilePath)
  }
  const attachmentsFilePath = datasetUtils.loadingDattachmentsFilePath(dataset)
  if (fs.pathExistsSync(attachmentsFilePath)) {
    await replaceAllAttachments(dataset, attachmentsFilePath)
  }

  await fs.remove(loadingDir)

  await datasetsService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset)
  debug('done')
}
