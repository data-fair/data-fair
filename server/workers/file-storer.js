exports.eventsPrefix = 'load'

exports.process = async function (app, dataset) {
  const fs = require('fs-extra')
  const datasetUtils = require('../datasets/utils')
  const datasetsService = require('../datasets/service')
  const { replaceAllAttachments } = require('../datasets/utils/attachments')
  const { basicTypes } = require('./file-normalizer')
  const datasetFileSample = require('../datasets/utils/file-sample')
  const chardet = require('chardet')
  const md5File = require('md5-file')

  const debug = require('debug')(`worker:file-storer:${dataset.id}`)

  /** @type {any} */
  const patch = { loaded: null, status: 'stored' }

  const loadingDir = datasetUtils.loadingDir(dataset)

  const datasetFile = dataset.loaded?.dataset
  if (datasetFile) {
    const loadedFilePath = datasetUtils.loadedFilePath(dataset)
    datasetFile.md5 = await md5File(loadedFilePath)
    const fileSample = await datasetFileSample(loadedFilePath)
    debug(`Attempt to detect encoding from ${fileSample.length} first bytes of file ${loadedFilePath}`)
    datasetFile.encoding = chardet.detect(fileSample)
    debug(`Detected encoding ${datasetFile.encoding} for file ${loadedFilePath}`)

    patch.originalFile = datasetFile
    if (basicTypes.includes(datasetFile.mimetype)) {
      patch.file = patch.originalFile
    }

    const newFilePath = datasetUtils.originalFilePath({ ...dataset, ...patch })
    await fs.move(loadedFilePath, newFilePath, { overwrite: true })
    if (dataset.originalFile) {
      const oldFilePath = datasetUtils.originalFilePath(dataset)
      if (oldFilePath !== newFilePath) {
        await fs.remove(oldFilePath)
      }
    }
  }
  if (dataset.loaded?.attachments) {
    await replaceAllAttachments(dataset, datasetUtils.loadedAttachmentsFilePath(dataset))
  }

  await fs.remove(loadingDir)

  await datasetsService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset)
  debug('done')
}
