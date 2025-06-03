import { join } from 'path'
import * as journals from '../misc/utils/journals.js'
import fs from 'fs-extra'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { Writable } from 'stream'
import pump from '../misc/utils/pipe.ts'
import * as es from '../datasets/es/index.ts'
import * as datasetUtils from '../datasets/utils/index.js'
import * as datasetsService from '../datasets/service.js'
import * as restDatasetsUtils from '../datasets/utils/rest.ts'
import * as heapUtils from '../misc/utils/heap.js'
import taskProgress from '../datasets/utils/task-progress.js'
import { tmpDir } from '../datasets/utils/files.ts'
import * as attachmentsUtils from '../datasets/utils/attachments.js'
import debugModule from 'debug'
import { internalError } from '@data-fair/lib-node/observer.js'
import mongo from '#mongo'

// Index tabular datasets with elasticsearch using available information on dataset schema
export const eventsPrefix = 'index'

export const process = async function (app, dataset) {
  const debug = debugModule(`worker:indexer:${dataset.id}`)
  const debugHeap = heapUtils.debug(`worker:indexer:${dataset.id}`)

  if (global.process.env.NODE_ENV === 'test' && dataset.slug === 'trigger-test-error') {
    throw new Error('This is a test error')
  }
  if (global.process.env.NODE_ENV === 'test' && dataset.slug === 'trigger-test-error-400') {
    throw httpError(400, '[noretry] This is a test 400 error')
  }

  if (dataset.isVirtual) throw new Error('Un jeu de données virtuel ne devrait pas passer par l\'étape indexation.')

  const db = mongo.db
  const esClient = app.get('es')

  const partialUpdate = dataset._partialRestStatus === 'updated' || dataset._partialRestStatus === 'extended'

  const attachmentsProperty = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')

  const newRestAttachments = dataset._newRestAttachments
  if (attachmentsProperty && newRestAttachments?.length) {
    for (const a of newRestAttachments) {
      let newAttachments
      if (a.startsWith('drop:')) {
        newAttachments = await attachmentsUtils.replaceAllAttachments(dataset, join(tmpDir, a.replace('drop:', '')))
      } else {
        newAttachments = await attachmentsUtils.addAttachments(dataset, join(tmpDir, a))
      }
      const bulkOp = restDatasetsUtils.collection(db, dataset).initializeUnorderedBulkOp()
      for (const a of newAttachments) {
        bulkOp.find({ [attachmentsProperty.key]: a }).update({ $set: { _needsIndexing: true } })
        // TODO: add option to remove attachments that don't match any line ?
      }
      await bulkOp.execute()
      await db.collection('datasets').updateOne({ id: dataset.id }, { $pull: { _newRestAttachments: a } })
    }
  }

  let indexName
  if (partialUpdate) {
    indexName = es.aliasName(dataset)
    debug(`Update index ${indexName}`)
  } else {
    try {
      indexName = await es.initDatasetIndex(esClient, dataset)
    } catch (err) {
      internalError('es-init-index', err)
      const { message } = es.extractError(err)
      throw new Error(message)
    }
    debug(`Initialize new dataset index ${indexName}`)
  }

  const indexStream = es.indexStream({ esClient, indexName, dataset, attachments: !!attachmentsProperty })

  if (!dataset.extensions || dataset.extensions.filter(e => e.active).length === 0) {
    if (dataset.file && await fs.pathExists(datasetUtils.fullFilePath(dataset))) {
      debug('Delete previously extended file')
      await fs.remove(datasetUtils.fullFilePath(dataset))
      if (!dataset.draftReason) await datasetUtils.updateStorage(dataset, false, true)
    }
  }

  debug('Run index stream')
  let readStreams, writeStream
  const progress = taskProgress(app, dataset.id, eventsPrefix, 100, (progress) => {
    debugHeap('progress ' + progress, indexStream)
  })
  await progress.inc(0)
  debugHeap('before-stream')
  if (dataset.isRest) {
    readStreams = await restDatasetsUtils.readStreams(db, dataset, partialUpdate ? { _needsIndexing: true } : {}, progress)
    writeStream = restDatasetsUtils.markIndexedStream(db, dataset)
  } else {
    const extended = dataset.extensions && dataset.extensions.find(e => e.active)
    if (!extended) await fs.remove(datasetUtils.fullFilePath(dataset))
    readStreams = await datasetUtils.readStreams(db, dataset, false, extended, dataset.validateDraft, progress)
    writeStream = new Writable({ objectMode: true, write (chunk, encoding, cb) { cb() } })
  }
  await pump(...readStreams, indexStream, writeStream)
  debug('index stream ok')
  debugHeap('after-stream')
  const errorsSummary = indexStream.errorsSummary()
  if (errorsSummary) await journals.log(app, dataset, { type: 'error', data: errorsSummary })

  const result = {
    schema: datasetUtils.cleanSchema(dataset)
  }
  if (partialUpdate) {
    result._partialRestStatus = 'indexed'
    result.count = await restDatasetsUtils.count(db, dataset)
  } else {
    result.status = 'indexed'
    debug('Switch alias to point to new datasets index')
    await es.switchAlias(esClient, dataset, indexName)
    result.count = indexStream.i
  }

  // Some data was updated in the interval during which we performed indexation
  // keep dataset as "updated" so that this worker keeps going
  if (dataset._partialRestStatus === 'extended' && await restDatasetsUtils.count(db, dataset, { _needsExtending: true })) {
    debug('REST dataset indexed, but some data still needs extending, get back in "updated" status')
    result._partialRestStatus = 'updated'
  } else if ((dataset._partialRestStatus === 'updated' || dataset._partialRestStatus === 'extended') && await restDatasetsUtils.count(db, dataset, { _needsIndexing: true })) {
    debug(`REST dataset indexed, but some data is still fresh, stay in "${dataset.status}" status`)
    result._partialRestStatus = dataset._partialRestStatus
  }

  await datasetsService.applyPatch(app, dataset, result)
}
