const fs = require('fs-extra')

exports.prepare = async function (app, dataset, patch) {
  const webhooks = require('../../misc/utils/webhooks')
  const journals = require('../../misc/utils/journals')

  const debug = require('debug')(`worker:draft-validator:${dataset.id}`)

  Object.assign(patch, dataset.draft)
  patch.draft = null
  if (dataset.draft.dataUpdatedAt) {
    patch.dataUpdatedAt = patch.updatedAt
    patch.dataUpdatedBy = patch.updatedBy
  }
  delete patch.status
  delete patch.finalizedAt
  delete patch.draftReason
  delete patch.count
  delete patch.bbox
  delete patch.storage

  debug('prepared draft patch', patch)

  const patchedDataset = { ...dataset, ...patch }

  if (dataset.file) {
    webhooks.trigger(app.get('db'), 'dataset', patchedDataset, { type: 'data-updated' })
  }
  await journals.log(app, patchedDataset, { type: 'draft-validated' }, 'dataset')

  debug('done')
}

exports.moveFiles = async function (app, dataset, patch) {
  const { dir, attachmentsDir, fsyncFile, filePath, originalFilePath, fullFilePath } = require('../../datasets/utils/files')

  const patchedDataset = { ...dataset, ...patch }
  const datasetDraft = { ...dataset, ...dataset.draft }

  await fs.ensureDir(dir(patchedDataset))

  if (await fs.pathExists(attachmentsDir(datasetDraft))) {
    await fs.remove(attachmentsDir(patchedDataset))
    await fs.move(attachmentsDir(datasetDraft), attachmentsDir(patchedDataset))
  }

  if (patchedDataset.originalFile && patchedDataset.originalFile.name !== patchedDataset.file?.name) {
    // creating empty file before moving seems to fix some weird bugs with NFS
    const newOriginalFilePath = originalFilePath(patchedDataset)
    // fsync to try and fix weird nfs bugs
    await fs.move(originalFilePath(datasetDraft), newOriginalFilePath, { overwrite: true })
    await fsyncFile(newOriginalFilePath)
  }
  if (dataset.originalFile && dataset.originalFile.name !== dataset.file?.name && originalFilePath(patchedDataset) !== originalFilePath(dataset)) {
    await fs.remove(originalFilePath(dataset))
  }

  const newFilePath = filePath(patchedDataset)
  // fsync to try and fix weird nfs bugs
  await fs.move(filePath(datasetDraft), newFilePath, { overwrite: true })
  await fsyncFile(newFilePath)
  if (dataset.file && newFilePath !== filePath(dataset)) {
    await fs.remove(filePath(dataset))
  }

  if (await fs.pathExists(fullFilePath(datasetDraft))) {
    const newFullFilePath = fullFilePath(patchedDataset)
    // fsync to try and fix weird nfs bugs
    await fs.move(fullFilePath(datasetDraft), newFullFilePath, { overwrite: true })
    await fsyncFile(newFullFilePath)
    if (dataset.file && newFullFilePath !== fullFilePath(dataset)) {
      await fs.remove(fullFilePath(dataset))
    }
  } else if (dataset.file) {
    await fs.remove(fullFilePath(dataset))
  }
}

exports.autoValidate = async function (app, dataset, patch) {
  const datasetsService = require('../../datasets/service')
  if (await datasetsService.isDraftCompatible(app, dataset, patch)) {
    patch._currentUpdate = null
    patch.status = 'finalized'
    await require('./file-storer').process(app, dataset, patch)
    await datasetsService.applyPatch(app, dataset, patch)
    await app.get('db').collection('datasets').updateOne({ id: dataset.id }, { $set: { status: 'updated', _currentUpdate: { validateDraft: true } } })
    return true
  } else {
    return false
  }
}
