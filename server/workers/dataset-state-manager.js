exports.process = async function (app, dataset) {
  const config = require('config')
  const datasetsService = require('../datasets/service')
  const datasetUtils = require('../datasets/utils')
  const { basicTypes, csvTypes } = require('../datasets/utils/files')
  const journals = require('../misc/utils/journals')

  const debug = require('debug')(`worker:dataset-state-manager:${dataset.id}`)

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
      debug('run task file downloader')
      await require('./tasks/file-downloader').process(app, { ...dataset, ...patch }, patch)
    }
  }

  // full processing a new data file
  if (dataset._currentUpdate?.dataFile || dataset._currentUpdate?.attachments) {
    debug('new data file loaded')
    debug('run task file-detector')
    await require('./tasks/file-detector').process(app, { ...dataset, ...patch }, patch)
    if (!basicTypes.includes(patch.originalFile?.mimetype)) {
      debug('run task file-normalizer')
      await require('./tasks/file-normalizer').process(app, { ...dataset, ...patch }, patch)
    }
    if (csvTypes.includes(patch.file.mimetype)) {
      debug('run task csv-analyzer')
      await require('./tasks/csv-analyzer').process(app, { ...dataset, ...patch }, patch)
    }
    if (patch.file.mimetype === 'application/geo+json') {
      debug('run task geojson-analyzer')
      await require('./tasks/geojson-analyzer').process(app, { ...dataset, ...patch }, patch)
    }
    // TODO: add a "schemaLocked" metadata to enforce strictly compatible schema with previous version of file ?
    if (datasetUtils.schemaHasValidationRules(patch.schema ?? dataset.schema)) {
      debug('run task file-validator')
      await require('./tasks/file-validator').process(app, { ...dataset, ...patch }, patch)
    }
    if (dataset.extensions && dataset.extensions.find(e => e.active)) {
      debug('run task extender')
      await require('./tasks/extender').process(app, { ...dataset, ...patch }, patch)
    }
    debug('run task indexer')
    dataset._newIndexName = await require('./tasks/indexer').process(app, { ...dataset, ...patch }, patch, true)
    debug('run task file-storer')
    await require('./tasks/file-storer').process(app, dataset, patch)
  } else {
    const reExtend = dataset._currentUpdate?.reExtend || (dataset.isRest && dataset.status === 'created')
    const reindex = dataset._currentUpdate?.reindex || reExtend
    if (reExtend && dataset.extensions && dataset.extensions.find(e => e.active)) {
      debug('run task extender')
      await require('./tasks/extender').process(app, { ...dataset, ...patch }, patch)
    }
    if (reindex) {
      debug('run task indexer')
      dataset._newIndexName = await require('./tasks/indexer').process(app, { ...dataset, ...patch }, patch, false)
    }
  }

  debug('run task finalizer')
  await require('./tasks/finalizer').process(app, { ...dataset, ...patch }, patch)

  if (dataset._newIndexName) {
    debug('switch elasticsearch alias', dataset._newIndexName)
    await require('../datasets/es').switchAlias(app.get('es'), { ...dataset, ...patch, _newIndexName: null }, dataset._newIndexName)
  }

  debug('apply patch', patch)
  await datasetsService.applyPatch(app, dataset, patch)

  await journals.log(app, dataset, { type: 'finalize-end' }, 'dataset', dataset.isRest)

  // After applying the patch to this dataset we neet to propagate some actions to other datasets

  // parent virtual datasets have to be re-finalized too
  if (!dataset.draftReason) {
    for await (const virtualDataset of db.collection('datasets').find({ 'virtual.children': dataset.id })) {
      debug(`mark virtual dataset ${virtualDataset.slug} (${virtualDataset.id}) as updated`)
      await db.collection('datasets').updateOne({ id: virtualDataset.id }, { $set: { status: 'updated' } })
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
      debug(`plan next update of extension ${extendedDataset.slug} (${extendedDataset.id})`)
      await db.collection('datasets').updateOne({ id: extendedDataset.id }, { $set: { extensions: extendedDataset.extensions } })
    }
  }
}
