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
    const loadedOriginalFilePath = datasetUtils.loadedFilePath(dataset)

    const newOriginalFilePath = datasetUtils.originalFilePath({ ...dataset, ...patch })
    await fs.move(loadedOriginalFilePath, newOriginalFilePath, { overwrite: true })
    if (dataset.originalFile) {
      const oldFilePath = datasetUtils.originalFilePath(dataset)
      if (oldFilePath !== newOriginalFilePath) {
        await fs.remove(oldFilePath)
      }
    }

    const newFilePath = datasetUtils.filePath({ ...dataset, ...patch })
    if (newFilePath !== newOriginalFilePath) {
      const loadedFilePath = datasetUtils.filePath({ ...dataset, ...patch }, true)
      await fs.move(loadedFilePath, newFilePath, { overwrite: true })
      if (dataset.file) {
        const oldFilePath = datasetUtils.originalFilePath(dataset)
        if (oldFilePath !== newOriginalFilePath) {
          await fs.remove(oldFilePath)
        }
      }
    }
  }

  if (dataset._currentUpdate?.attachments) {
    await replaceAllAttachments(dataset, datasetUtils.loadedAttachmentsFilePath(dataset))
  }

  const loadedAttachmentsDir = datasetUtils.loadedAttachmentsDir(dataset)
  if (await fs.pathExists(loadedAttachmentsDir)) {
    const existingAttachmentsDir = datasetUtils.attachmentsDir(dataset)
    await fs.remove(existingAttachmentsDir)
    await fs.move(loadedAttachmentsDir, existingAttachmentsDir)
  }

  await fs.remove(loadingDir)

  debug('done')
}
