exports.eventsPrefix = 'dataset-state'

exports.process = async function (app, dataset) {
  const config = require('config')
  const datasetsService = require('../datasets/service')
  const datasetUtils = require('../datasets/utils')
  const { basicTypes, csvTypes } = require('../datasets/utils/files')

  const db = app.get('db')
  const now = new Date().toISOString()

  // Apply different tasks on the dataset depending on its type, its state, and the content of the last update
  // the dataset object is passed to all tasks, also a patch object is passed around and completed so that all changes are applied at the end

  const patch = {}

  if (dataset.status === 'created') {
    await require('./tasks/initializer').process(app, dataset, patch)
  }

  if (dataset.remoteFile) {
    if (
      dataset.status === 'created' ||
      dataset._currentUpdate?.downloadRemoteFile ||
      (dataset.status === 'finalized' && dataset.remoteFile?.autoUpdate?.active && dataset.remoteFile.autoUpdate.nextUpdate < now)
    ) {
      await require('./tasks/file-downloader').process(app, { ...dataset, ...patch }, patch)
    }
  }

  if (dataset.loaded) {
    await require('./tasks/file-detector').process(app, { ...dataset, ...patch }, patch)
    if (!basicTypes.includes(patch.originalFile?.mimetype)) {
      await require('./tasks/file-normalizer').process(app, { ...dataset, ...patch }, patch)
    }
    if (csvTypes.includes(patch.file.mimetype)) {
      await require('./tasks/csv-analyzer').process(app, { ...dataset, ...patch }, patch)
    }
    if (patch.file.mimetype === 'application/geo+json') {
      await require('./tasks/geojson-analyzer').process(app, { ...dataset, ...patch }, patch)
    }
    // TODO: add a "schemaLocked" metadata to enforce strictly compatible schema with previous version of file ?
    if (datasetUtils.schemaHasValidationRules(patch.schema ?? dataset.schema)) {
      await require('./tasks/file-validator').process(app, { ...dataset, ...patch }, patch)
    }
    if (dataset.extensions && dataset.extensions.find(e => e.active)) {
      await require('./tasks/extender').process(app, { ...dataset, ...patch }, patch)
    }
    await require('./tasks/indexer').process(app, { ...dataset, ...patch }, patch)
    await require('./tasks/file-storer').process(app, { ...dataset, ...patch }, patch)
  }

  await require('./tasks/finalizer').process(app, dataset, patch)

  await datasetsService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset, false, true)

  // After applying the patch to this dataset we neet to propagate some actions to other datasets

  // parent virtual datasets have to be re-finalized too
  if (!dataset.draftReason) {
    for await (const virtualDataset of db.collection('datasets').find({ 'virtual.children': dataset.id })) {
      await db.collection('datasets').updateOne({ id: virtualDataset.id }, { $set: { status: 'indexed' } })
    }
  }

  // trigger auto updates if this dataset is used as a source of extensions
  if (dataset.masterData?.bulkSearchs?.length) {
    const dayjs = require('dayjs')
    const nextUpdate = dayjs().add(config.extensionUpdateDelay, 'seconds').toISOString()
    const cursor = db.collection('datasets').find({
      extensions: { $elemMatch: { active: true, autoUpdate: true, remoteService: 'dataset:' + dataset.id } }
    })
    for await (const extendedDataset of cursor) {
      for (const extension of extendedDataset.extensions) {
        if (extension.active && extension.autoUpdate && extension.remoteService === 'dataset:' + dataset.id) {
          extension.nextUpdate = nextUpdate
        }
      }
      await db.collection('datasets').updateOne({ id: extendedDataset.id }, { $set: { extensions: extendedDataset.extensions } })
    }
  }
}
