const fs = require('fs-extra')
const datasetUtils = require('../../datasets/utils')
const { replaceAllAttachments } = require('../../datasets/utils/attachments')

exports.process = async function (app, dataset, patch) {
  const debug = require('debug')(`worker:file-storer:${dataset.id}`)

  /** @type {any} */
  patch.loaded = null
  const loadingDir = datasetUtils.loadingDir(dataset)

  const datasetFile = dataset._currentUpdate?.dataFile
  if (datasetFile) {
    const loadedFilePath = datasetUtils.loadedFilePath(dataset)

    const newFilePath = datasetUtils.originalFilePath({ ...dataset, ...patch })
    await fs.move(loadedFilePath, newFilePath, { overwrite: true })
    if (dataset.originalFile) {
      const oldFilePath = datasetUtils.originalFilePath(dataset)
      if (oldFilePath !== newFilePath) {
        await fs.remove(oldFilePath)
      }
    }
  }

  if (dataset._currentUpdate?.attachments) {
    await replaceAllAttachments(dataset, datasetUtils.loadedAttachmentsFilePath(dataset))
  }

  await fs.remove(loadingDir)

  debug('done')
}
