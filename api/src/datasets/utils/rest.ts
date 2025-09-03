import config from '#config'
import mongo from '#mongo'
import crypto from 'node:crypto'
import fs from 'fs-extra'
import path from 'path'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { ajv } from '@data-fair/data-fair-shared/ajv.js'
import { errorsText } from '@data-fair/lib-validation'
import { nanoid } from 'nanoid'
import pump from '../../misc/utils/pipe.ts'
import multer from 'multer'
import mime from 'mime-types'
import { Readable, Transform, Writable } from 'stream'
import moment from 'moment'
import crc from 'crc'
import md5File from 'md5-file'
import stableStringify from 'fast-json-stable-stringify'
import LinkHeader from 'http-link-header'
import unzipper from 'unzipper'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration.js'
import * as storageUtils from './storage.ts'
import * as extensionsUtils from './extensions.ts'
import * as findUtils from '../../misc/utils/find.js'
import * as fieldsSniffer from './fields-sniffer.js'
import { transformFileStreams, formatLine } from './data-streams.js'
import { attachmentPath, lsAttachments, tmpDir } from './files.ts'
import { jsonSchema } from './data-schema.ts'
import { aliasName } from '../es/commons.js'
import indexStream from '../es/index-stream.js'
import { initDatasetIndex, switchAlias } from '../es/manage-indices.js'
import { tabularTypes } from './types.js'
import { Piscina } from 'piscina'
import { internalError } from '@data-fair/lib-node/observer.js'
import type { DatasetLineAction, DatasetLine, RestDataset, DatasetLineRevision, RestActionsSummary } from '#types'
import type { NextFunction, Response, RequestHandler } from 'express'
import { reqSessionAuthenticated, reqUserAuthenticated, type Account, type SessionStateAuthenticated } from '@data-fair/lib-express'
import { type ValidateFunction } from 'ajv'
import { type RequestWithRestDataset } from '#types/dataset/index.ts'
import type { Collection, Filter, UnorderedBulkOperation, UpdateFilter } from 'mongodb'
import iterHits from '../es/iter-hits.ts'

type Operation = {
  _id: string,
  _action: string,
  body: any,
  fullBody: any,
  filter: { _id: string },
  _status?: number,
  _error?: string
}

dayjs.extend(duration)

export const sheet2csvPiscina = new Piscina({
  filename: path.resolve(import.meta.dirname, '../threads/sheet2csv.js'),
  minThreads: 0,
  idleTimeout: 60 * 60 * 1000,
  maxThreads: 1
})

const actions = ['create', 'update', 'createOrUpdate', 'patch', 'delete']

function cleanLine (line: DatasetLine) {
  delete line._needsIndexing
  delete line._needsExtending
  delete line._deleted
  delete line._action
  delete line._error
  delete line._hash
  return line
}

const destination: multer.DiskStorageOptions['destination'] = async (req, file, cb) => {
  try {
    await fs.ensureDir(tmpDir)
    cb(null, tmpDir)
  } catch (err) {
    cb(err as Error, '')
  }
}

const filename: multer.DiskStorageOptions['filename'] = async (req, file, cb) => {
  try {
    const uid = nanoid()
    // creating empty file before streaming seems to fix some weird bugs with NFS
    await fs.ensureFile(path.join(tmpDir, uid))
    cb(null, uid)
  } catch (err) {
    cb(err as Error, '')
  }
}

const padISize = (config.mongo.maxBulkOps - 1).toString().length
// cf https://github.com/puckey/pad-number/blob/master/index.js
const padI = (i: number, padSize = padISize) => {
  const str = i.toString()
  return new Array((padSize - str.length) + 1).join('0') + str
}

export const uploadAttachment = multer({
  storage: multer.diskStorage({ destination, filename })
}).single('attachment')

export const fixFormBody: RequestHandler = (req, res, next) => {
  if (req.body?._body) {
    req.body = JSON.parse(req.body._body)
    req._fixedFormBody = true
  }
  next()
}

export const uploadBulk = multer({
  storage: multer.diskStorage({ destination, filename })
}).fields([{ name: 'attachments', maxCount: 1 }, { name: 'actions', maxCount: 1 }])

export const collectionName = (dataset: RestDataset) => 'dataset-data-' + dataset.id
export const collection = (dataset: RestDataset) => mongo.db.collection<DatasetLine>(collectionName(dataset))

export const revisionsCollectionName = (dataset: RestDataset) => 'dataset-revisions-' + dataset.id
export const revisionsCollection = (dataset: RestDataset) => mongo.db.collection<DatasetLineRevision>(revisionsCollectionName(dataset))

export const initDataset = async (dataset: RestDataset) => {
  // just in case of badly cleaned data from previous dataset with same id
  try {
    await deleteDataset(dataset)
  } catch (err) {
    // nothing
  }
  const c = collection(dataset)
  await Promise.all([
    c.createIndex({ _needsIndexing: 1 }, { sparse: true }),
    c.createIndex({ _needsExtending: 1 }, { sparse: true }),
    c.createIndex({ _i: -1 }, { unique: true })
  ])
}

export const configureHistory = async (dataset: RestDataset) => {
  const db = mongo.db
  const revisionsCollectionExists = (await db.listCollections({ name: revisionsCollectionName(dataset) }).toArray()).length === 1
  if (!dataset.rest.history) {
    if (revisionsCollectionExists) {
      await revisionsCollection(dataset).drop()
      await storageUtils.updateStorage(dataset)
    }
  } else {
    const rc = revisionsCollection(dataset)
    if (!revisionsCollectionExists) {
      // create revisions collection and fill it with initial state
      await rc.createIndex({ _lineId: 1, _i: -1 })
      let revisionsBulkOp = rc.initializeUnorderedBulkOp()
      for await (const line of collection(dataset).find<DatasetLine>({})) {
        const revision: DatasetLineRevision = { ...line, _action: 'create', _lineId: line._id }
        delete revision._needsIndexing
        delete revision._needsExtending
        delete revision._id
        if (!revision._deleted) delete revision._deleted
        revisionsBulkOp.insert(revision)
        if (revisionsBulkOp.length >= config.mongo.maxBulkOps) {
          await revisionsBulkOp.execute()
          revisionsBulkOp = rc.initializeUnorderedBulkOp()
        }
      }
      if (revisionsBulkOp.length) await revisionsBulkOp.execute()
      await storageUtils.updateStorage(dataset)
    }

    // manage history TTL
    if (dataset.rest.historyTTL && dataset.rest.historyTTL.active && dataset.rest.historyTTL.delay && dataset.rest.historyTTL.delay.value) {
      const expireAfterSeconds = dayjs.duration(dataset.rest.historyTTL.delay.value, dataset.rest.historyTTL.delay.unit || 'days').asSeconds()
      await rc.createIndex({ _updatedAt: 1 }, { expireAfterSeconds, name: 'history-ttl' })
    } else {
      try {
        await rc.dropIndex('history-ttl')
      } catch (err: any) {
        if (err.codeName !== 'IndexNotFound') throw err
      }
    }
  }
}

export const deleteDataset = async (dataset: RestDataset) => {
  await collection(dataset).drop()
  const revisionsCollectionExists = (await mongo.db.listCollections({ name: revisionsCollectionName(dataset) }).toArray()).length === 1
  if (revisionsCollectionExists) revisionsCollection(dataset).drop()
}

const getLineId = (line: DatasetLine, dataset: RestDataset, raw?: boolean) => {
  if (dataset.primaryKey && dataset.primaryKey.length) {
    if (raw) line = formatLine({ ...line }, dataset.schema)
    const primaryKey = dataset.primaryKey.map(p => line[p] + '')
    if (dataset.rest?.primaryKeyMode === 'sha256') {
      return crypto.createHash('sha256').update(JSON.stringify(primaryKey)).digest('hex')
    } else {
      // base64 by default for retro-compatibility
      return Buffer.from(JSON.stringify(primaryKey).slice(2, -2)).toString('hex')
    }
  }
}

const linesOwnerCols = (linesOwner: Account) => {
  const cols: { _owner: string, _ownerName?: string } = { _owner: linesOwner.type + ':' + linesOwner.id }
  if (linesOwner.department) cols._owner += ':' + linesOwner.department
  if (linesOwner.name) {
    cols._ownerName = linesOwner.name
    if (linesOwner.departmentName) cols._ownerName += ` (${linesOwner.department})`
  }
  return cols
}
const linesOwnerFilter = (linesOwner: Account) => {
  if (!linesOwner) return {}
  const cols = linesOwnerCols(linesOwner)
  return { _owner: cols._owner }
}

const getLineHash = (line: DatasetLine) => {
  return crc.crc32(stableStringify(line)).toString(16)
}

const getLineIndice = (dataset: RestDataset, updatedAt: Date, i: number, datasetCreatedAt: number, chunkRand: string) => {
  if (!updatedAt) throw new Error('getLineIndice requires _updatedAt')
  // timestamp2 produced too large number and there was some precision loss
  if (dataset.rest.indiceMode === 'timestamp3') {
    // in hundredth of a second
    const timeDiff = Math.floor((updatedAt.getTime() - datasetCreatedAt) / 10)
    const padSize = Math.max(padISize, chunkRand.length) + 1
    return Number(timeDiff + padI(i + Number(chunkRand), padSize))
  } else if (dataset.rest.indiceMode === 'timestamp2') {
    // we added a random component in case of parallel operations
    let nbStr = (updatedAt.getTime() - datasetCreatedAt) + chunkRand + padI(i)
    let nb = Number(nbStr)
    if (nbStr !== nb.toString()) {
      // loss of precision on too big numbers, use random number to create unique value
      nbStr = (updatedAt.getTime() - datasetCreatedAt) + Math.random().toString().slice(2, 7) + padI(i)
      nb = Number(nbStr)
    }
    return nb
  } else {
    return Number((updatedAt.getTime() - datasetCreatedAt) + padI(i))
  }
}

const getLineFromOperation = (operation: Operation, ogBody?: any): DatasetLine => {
  const line: any = { ...operation }
  delete line.body
  delete line.fullBody
  delete line.filter
  Object.assign(line, operation.fullBody)

  // restore multi-valued data that was sent as a string
  if (ogBody) {
    for (const key of Object.keys(ogBody)) {
      if (Array.isArray(line[key]) && typeof ogBody[key] === 'string') {
        line[key] = ogBody[key]
      }
    }
  }
  return line
}

const checkMissingIdsRevisions = async (tmpDataset: RestDataset, dataset: RestDataset, existingIds: string[], sessionState: SessionStateAuthenticated) => {
  const missingIds = new Set(existingIds)
  for await (const stillExistingDoc of collection(tmpDataset).find({ _id: { $in: existingIds } })) {
    missingIds.delete(stillExistingDoc._id)
  }
  if (missingIds.size) {
    const updatedAt = new Date()
    const datasetCreatedAt = new Date(dataset.createdAt).getTime()
    let i = 0
    const revisionsBulkOp = revisionsCollection(dataset).initializeUnorderedBulkOp()
    const chunkRand = Math.random().toString().slice(2, 7)

    for await (const missingDoc of collection(dataset).find({ _id: { $in: [...missingIds] } }).project(getPrimaryKeyProjection(dataset))) {
      i++
      if (missingDoc._deleted) continue
      const revision: DatasetLineRevision = {
        _action: 'delete',
        _updatedAt: updatedAt,
        ...missingDoc,
        _i: getLineIndice(dataset, updatedAt, i, datasetCreatedAt, chunkRand),
        _deleted: true,
        _hash: null,
        _lineId: missingDoc._id
      }
      delete revision._id
      if (sessionState.user && dataset.rest.storeUpdatedBy) {
        revision._updatedBy = sessionState.user.id
        revision._updatedByName = sessionState.user.name
      }
      delete revision._needsIndexing
      delete revision._needsExtending
      revisionsBulkOp.insert(revision)
    }
    await revisionsBulkOp.execute()
  }
}

const createTmpMissingRevisions = async (tmpDataset: RestDataset, dataset: RestDataset, sessionState: SessionStateAuthenticated) => {
  let existingIds: string[] = []

  for await (const existingDoc of collection(dataset).find({}).project({ _id: 1 })) {
    existingIds.push(existingDoc._id)
    if (existingIds.length === 1000) {
      await checkMissingIdsRevisions(tmpDataset, dataset, existingIds, sessionState)
      existingIds = []
    }
  }
  if (existingIds.length) await checkMissingIdsRevisions(tmpDataset, dataset, existingIds, sessionState)
}

const getPrimaryKeyProjection = (dataset: RestDataset) => {
  const primaryKeyProjection: Record<string, 1> = { _id: 1, _hash: 1, _deleted: 1 }
  if (dataset.primaryKey && dataset.primaryKey.length) {
    for (const key of dataset.primaryKey) primaryKeyProjection[key] = 1
  }
  return primaryKeyProjection
}

export const applyTransactions = async (dataset: RestDataset, sessionState: SessionStateAuthenticated | undefined, transacs: DatasetLineAction[], validate?: ValidateFunction, linesOwner?: Account, tmpDataset?: RestDataset) => {
  const datasetCreatedAt = new Date(dataset.createdAt).getTime()
  const updatedAt = new Date()
  const c = collection(tmpDataset || dataset)
  const rc = revisionsCollection(dataset)
  const history = dataset.rest && dataset.rest.history
  const patchProjection: Record<string, 1> = { _id: 1, _hash: 1, _deleted: 1 }
  for (const prop of dataset.schema) {
    if (!prop['x-calculated'] && !prop['x-extension']) {
      patchProjection[prop.key] = 1
    }
  }
  const primaryKeyProjection = getPrimaryKeyProjection(dataset)

  // prepare future results that will be completed by the following loops
  const operations = []
  let i = 0
  const patchPreviousFilters = []
  const deletePreviousFilters = []
  const chunkRand = Math.random().toString().slice(2, 7)
  for (const transac of transacs) {
    const { _action, ...body } = transac
    if (_action && !actions.includes(_action)) throw httpError(400, `action "${_action}" is unknown, use one of ${JSON.stringify(actions)}`)
    if (linesOwner) Object.assign(body, linesOwnerCols(linesOwner))
    if (!body._id) throw httpError(400, '"_id" attribute is required')

    const filter = { _id: body._id }
    if (linesOwner) Object.assign(filter, linesOwnerFilter(linesOwner))

    const operation: Operation = {
      _id: body._id,
      _action: _action ?? 'createOrUpdate',
      body,
      fullBody: { ...body },
      filter
    }
    operations.push(operation)

    if (dataset.extensions && dataset.extensions.find(e => e.active)) {
      operation.fullBody._needsExtending = true
    } else {
      operation.fullBody._needsIndexing = true
    }
    operation.fullBody._updatedAt = body._updatedAt ? new Date(body._updatedAt) : updatedAt
    operation.fullBody._i = getLineIndice(dataset, operation.fullBody._updatedAt, i, datasetCreatedAt, chunkRand)
    i++
    // lots of objects to process, so we yield to the event loop every 100 lines
    if (i % 100 === 0) await new Promise(resolve => setImmediate(resolve))

    if (dataset.rest.storeUpdatedBy && sessionState) {
      operation.fullBody._updatedBy = sessionState.user.id
      operation.fullBody._updatedByName = sessionState.user.name
    }

    if (_action === 'delete') {
      operation.fullBody._deleted = true
      operation.fullBody._hash = null
      deletePreviousFilters.push(operation.filter)
    } else {
      operation.fullBody._deleted = false
      if (_action === 'patch') {
        patchPreviousFilters.push(operation.filter)
      }
    }
  }

  // fill data with previous bodies for patch operations
  if (patchPreviousFilters.length) {
    const missingPatchPrevious = new Set(patchPreviousFilters.map(f => f._id))
    for await (const patchPrevious of c.find({ $or: patchPreviousFilters }).project(patchProjection)) {
      const { _id, _hash, _deleted, ...previousBody } = patchPrevious
      if (!_deleted) {
        missingPatchPrevious.delete(_id)
        const operation = operations.find(op => op._id === _id)
        if (operation) {
          operation.body = { ...previousBody, ...operation.body }
          Object.assign(operation.fullBody, operation.body)
          for (const key in operation.body) {
            if (operation.body[key] === null) {
              delete operation.body[key]
              delete operation.fullBody[key]
            }
          }
          operation.fullBody._hash = getLineHash(operation.body)
          if (operation.fullBody._hash === _hash) {
            operation._status = 304
          }
        }
      }
    }
    for (const _id of missingPatchPrevious) {
      const operation = operations.find(op => op._id === _id)
      if (operation) {
        operation._status = 404
        operation._error = 'ligne non trouvée'
      }
    }
  }

  // check delete operations and complete their primary key info
  if (deletePreviousFilters.length) {
    const missingDeletePrevious = new Set(deletePreviousFilters.map(f => f._id))
    for await (const deletePrevious of c.find({ $or: deletePreviousFilters }).project(primaryKeyProjection)) {
      const { _id, _hash, _deleted, ...previousBody } = deletePrevious
      if (!_deleted) {
        missingDeletePrevious.delete(_id)
        const operation = operations.find(op => op._id === _id)
        if (operation) {
          Object.assign(operation.fullBody, previousBody)
        }
      }
    }
    for (const _id of missingDeletePrevious) {
      const operation = operations.find(op => op._id === _id)
      if (operation) {
        operation._status = 404
        operation._error = 'ligne non trouvée'
      }
    }
  }

  // now that operations were completed perform validation and calculate hash for all operations
  const createUpdatePreviousFilters = []
  let v = 0
  for (const operation of operations) {
    if (operation._action === 'delete') continue
    if (operation._status) continue
    if (validate) {
      v++
      // validation can be CPU intensive, so we yield to the event loop every 100 lines
      if (v % 100 === 0) await new Promise(resolve => setImmediate(resolve))
    }
    const primaryKeyId = getLineId(operation.body, dataset)
    if (primaryKeyId && operation._id !== primaryKeyId) {
      operation._status = 400
      operation._error = 'identifiant de ligne incompatible avec la clé primaire'
      continue
    } if (validate) {
      if (!validate(operation.body)) {
        if (dataset.nonBlockingValidation) {
          operation._warning = errorsText(validate.errors, '')
        } else {
          operation._error = errorsText(validate.errors, '')
          operation._status = 400
          continue
        }
      }
    }

    if (operation._action !== 'patch') {
      operation.fullBody._hash = getLineHash(operation.body)
      if (operation._action === 'create' || operation._action === 'update') {
        createUpdatePreviousFilters.push(operation.filter)
      }
    }
  }

  // check existence and hash for operations (create and update)
  // createOrUpdate operation use upsert with hash filter and so don't need this check
  if (createUpdatePreviousFilters.length) {
    const missingCheckPrevious = new Set(createUpdatePreviousFilters.map(f => f._id))
    for await (const checkPrevious of c.find({ $or: createUpdatePreviousFilters }).project({ _id: 1, _hash: 1, _deleted: 1 })) {
      const { _id, _hash, _deleted } = checkPrevious
      if (!_deleted) {
        missingCheckPrevious.delete(_id)
        const operation = operations.find(op => op._id === _id)
        if (operation) {
          if (operation._action === 'create') {
            operation._status = 409
            operation._error = 'cet identifiant de ligne est déjà utilisé'
          } else {
            if (operation.fullBody._hash === _hash) {
              operation._status = 304
            } else {
              operation._status = 200
            }
          }
        }
      }
    }
    for (const _id of missingCheckPrevious) {
      const operation = operations.find(op => op._id === _id)
      if (operation) {
        if (operation._action === 'create') {
          operation._status = 201
        } else {
          operation._status = 404
          operation._error = 'ligne non trouvée'
        }
      }
    }
  }

  // actually perform the operations and flag errors
  const bulkOp = c.initializeUnorderedBulkOp()
  const bulkOpMatchingOperations = []
  for (const operation of operations) {
    if (operation._status && operation._status >= 300) continue
    bulkOpMatchingOperations.push(operation)
    if (operation._action === 'delete' || operation._action === 'update' || operation._action === 'patch') {
      bulkOp.find(operation.filter).replaceOne(operation.fullBody)
    } else if (operation._action === 'create') {
      bulkOp.insert(operation.fullBody)
    } else { // 'createOrUpdate'
      const conflictFilter = { ...operation.filter, _hash: { $ne: operation.fullBody._hash } }
      bulkOp.find(conflictFilter).upsert().replaceOne(operation.fullBody)
    }
  }
  let bulkOpResult
  if (bulkOpMatchingOperations.length) {
    try {
      bulkOpResult = await bulkOp.execute()
    } catch (err: any) {
      if (!err.writeErrors) throw err
      for (const writeError of err.writeErrors) {
        const operation = bulkOpMatchingOperations[writeError.err.index]
        if (writeError.err.code === 11000) {
          if (writeError.err.errmsg?.includes('_i_')) {
            console.error(writeError)
            operation._status = 500
            operation._error = 'erreur dans la gestion des conflits de données insérées'
          } else {
            if (operation._action === 'create') {
              operation._status = 409
              operation._error = 'cet identifiant de ligne est déjà utilisé'
            }
            if (operation._action === 'createOrUpdate') {
            // this conflict means that the hash was unchanged
              operation._status = 304
            }
          }
        } else {
          operation._status = 500
          operation._error = writeError.err.errmsg
        }
      }
    }
  }

  // insert revisions for lines that were actually modified
  if (history) {
    let hasRevisionsBulkOp = false
    const revisionsBulkOp = rc.initializeUnorderedBulkOp()
    let h = 0
    for (const operation of operations) {
      if (operation._status && operation._status >= 300) continue
      h++
      // lots of objects to process, so we yield to the event loop every 100 lines
      if (h % 100 === 0) await new Promise(resolve => setImmediate(resolve))
      const revision = getLineFromOperation(operation) as unknown as DatasetLineRevision
      delete revision._id
      revision._lineId = operation._id
      delete revision._needsIndexing
      delete revision._needsExtending
      revisionsBulkOp.insert(revision)
      hasRevisionsBulkOp = true
    }
    if (hasRevisionsBulkOp) {
      await revisionsBulkOp.execute()
    }
  } else {
    for (const operation of operations) {
      if (operation._action === 'delete' && !operation._error && (!operation._status || operation._status < 300)) {
        const dir = attachmentPath(dataset, operation._id)
        await fs.remove(dir)
      }
    }
  }

  if (bulkOpMatchingOperations.length && sessionState) {
    mongo.datasets.updateOne(
      { id: dataset.id },
      { $set: { dataUpdatedAt: updatedAt.toISOString(), dataUpdatedBy: { id: sessionState.user.id, name: sessionState.user.name } } })
  }

  return { operations, bulkOpResult }
}

const applyReqTransactions = async (req: RequestWithRestDataset, transacs: DatasetLineAction[], validate: ValidateFunction, tmpDataset?: RestDataset) => {
  return applyTransactions(req.dataset, reqSessionAuthenticated(req), transacs, validate, req.linesOwner, tmpDataset)
}

type Summary = RestActionsSummary & { _ids: Set<string> }

const initSummary = (): Summary => ({ nbOk: 0, nbNotModified: 0, nbErrors: 0, nbWarnings: 0, nbCreated: 0, nbModified: 0, nbDeleted: 0, errors: [], warnings: [], _ids: new Set() })

type TransactionStreamOptions = {
  dataset: RestDataset,
  sessionState?: SessionStateAuthenticated,
  linesOwner?: Account,
  validate?: ValidateFunction,
  tmpDataset?: RestDataset,
  summary: Summary
}

class TransactionStream extends Writable {
  options: TransactionStreamOptions
  i: number
  transactions: DatasetLineAction[]
  constructor (options: TransactionStreamOptions) {
    super({ objectMode: true })
    this.options = options
    this.i = 0
    this.transactions = []
  }

  async applyTransactions () {
    const { operations, bulkOpResult } = await applyTransactions(this.options.dataset, this.options.sessionState, this.transactions, this.options.validate, this.options.linesOwner, this.options.tmpDataset)

    if (operations.length + this.options.summary._ids.size < config.elasticsearch.maxBulkLines) {
      for (const op of operations) this.options.summary._ids.add(op._id)
    }

    this.transactions = []
    if (bulkOpResult) {
      this.options.summary.nbCreated += bulkOpResult.upsertedCount
      this.options.summary.nbCreated += bulkOpResult.insertedCount
      this.options.summary.nbModified += bulkOpResult.modifiedCount
    }

    for (const operation of operations) {
      if (operation._error || operation._status === 500) {
        this.options.summary.nbErrors += 1
        if (this.options.summary.errors.length < 10) {
          this.options.summary.errors.push({ line: this.i, error: operation._error ?? '', status: operation._status ?? 500 })
        }
      } else {
        if (operation._warning) {
          this.options.summary.nbWarnings += 1
          if (this.options.summary.warnings.length < 10) {
            this.options.summary.warnings.push({ line: this.i, warning: operation._warning })
          }
        }
        this.options.summary.nbOk += 1
        if (operation._status === 304) {
          this.options.summary.nbNotModified += 1
        }
        if (operation._action === 'delete') {
          this.options.summary.nbDeleted += 1
          this.options.summary.nbModified -= 1
        }
      }
      this.i += 1
    }
    this.emit('batch')
  }

  async writePromise (chunk: DatasetLineAction) {
    chunk._action = chunk._action || 'createOrUpdate'
    delete chunk._i
    if (['create', 'createOrUpdate'].includes(chunk._action) && !chunk._id) {
      chunk._id = getLineId(chunk, this.options.dataset) || nanoid()
    } else if (!chunk._id) { // delete by primary key
      const lineId = getLineId(chunk, this.options.dataset)
      if (!lineId) throw httpError(400, 'failed to determine required _id from primary key')
      chunk._id = lineId
    }

    // prevent working twice on a line in the same bulk, this way sequentiality doesn't matter and we can use mongodb unordered bulk
    if (chunk._id && this.transactions.find(c => c._id === chunk._id)) {
      await this.applyTransactions()
      // weirdly the separation of transactions is not always sufficient to ensure that the operations
      // are performed in the same order (some test regularly breaks)
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    this.transactions.push(chunk)

    // WARNING: changing this number has impact on the _i generation logic
    if (this.transactions.length > config.mongo.maxBulkOps) await this.applyTransactions()
  }

  _write (chunk: DatasetLineAction, encoding: string, cb: (err?: any) => void) {
    // use then syntax cf https://github.com/nodejs/node/issues/39535
    this.writePromise(chunk).then(() => cb(), cb)
  }

  _final (cb: (err?: any) => void) {
    // use then syntax cf https://github.com/nodejs/node/issues/39535
    this.applyTransactions().then(() => cb(), cb)
  }
}

const compileSchema = (dataset: RestDataset, adminMode: boolean) => {
  const schema = jsonSchema(dataset.schema.filter(p => !p['x-calculated'] && !p['x-extension']))
  schema.additionalProperties = false
  schema.properties._id = { type: 'string' }
  // super-admins can set _updatedAt and so rewrite history
  if (adminMode) schema.properties._updatedAt = { type: 'string', format: 'date-time' }
  return ajv.compile(schema)
}

async function checkMatchingAttachment (req: { body: any }, lineId: string, dir: string, pathField: { key: string }) {
  if (pathField && req.body[pathField.key] && req.body[pathField.key].startsWith(lineId + '/')) {
    const fileName = req.body[pathField.key].replace(lineId + '/', '')
    try {
      const fileNames = await fs.readdir(dir)
      if (fileNames.includes(fileName)) return true
    } catch (err) {
      // missing directory, nothing to do
    }
  }
  return false
}

async function manageAttachment (req: RequestWithRestDataset & { body: any }, keepExisting: boolean) {
  if (req.is('multipart/form-data') && !req._fixedFormBody) {
    req._rawBody = { ...req.body }
    // When taken from form-data everything is string.. convert to actual types
    for (const f of req.dataset.schema) {
      if (!f['x-calculated']) {
        if (req.body[f.key] !== undefined) {
          const value = fieldsSniffer.format(req.body[f.key], f)
          if (value !== null) req.body[f.key] = value
        }
      }
    }
  }
  const lineId = req.params.lineId || req.body._id
  const dir = attachmentPath(req.dataset, lineId)

  const pathField = req.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')

  if (req.file) {
    // An attachment was uploaded
    await fs.ensureDir(dir)
    if (!req.dataset.rest?.history) await fs.emptyDir(dir)
    const fileMd5 = await md5File(req.file.path)
    await fs.ensureDir(path.join(dir, fileMd5))
    const relativePath = path.join(lineId, fileMd5, req.file.originalname)
    await fs.rename(req.file.path, attachmentPath(req.dataset, relativePath))
    if (!pathField) {
      throw httpError(400, 'Le schéma ne prévoit pas d\'associer une pièce jointe')
    }
    req.body[pathField.key] = relativePath
  } else if (!keepExisting && pathField) {
    if (!checkMatchingAttachment(req, lineId, dir, pathField)) {
      await fs.remove(dir)
    }
  }
}

// bulk operations are processed by the workers, but single line changes are processed in real time
// this allows for read-after-write when editing the dataset
async function commitLines (dataset: RestDataset, lineIds: string[]) {
  if (dataset.extensions && dataset.extensions.find(e => e.active)) {
    await extensionsUtils.extend(dataset, dataset.extensions, 'lineIds', true, lineIds)
  }
  const attachments = !!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  const indexName = aliasName(dataset)
  await pump(
    ...await readStreams(dataset, { _id: { $in: lineIds } }),
    indexStream({ indexName, dataset, attachments, refresh: config.elasticsearch.singleLineOpRefresh }),
    markIndexedStream(dataset)
  )

  await mongo.datasets.updateOne({ id: dataset.id, _partialRestStatus: { $exists: false } }, {
    $set: {
      _partialRestStatus: 'indexed',
      count: await count(dataset)
    }
  })
}

export const readLine = async (req: RequestWithRestDataset, res: Response, next: NextFunction) => {
  const c = collection(req.dataset)
  const filter: Filter<DatasetLine> = { _id: req.params.lineId }
  if (req.linesOwner) Object.assign(filter, linesOwnerFilter(req.linesOwner))
  const line = await c.findOne(filter)
  if (!line) return res.status(404).send('Identifiant de ligne inconnu')
  if (line._deleted) return res.status(404).send('Identifiant de ligne inconnu')
  cleanLine(line)
  const updatedAt = line._updatedAt && (new Date(line._updatedAt)).toUTCString()
  if (updatedAt) {
    const ifModifiedSince = req.get('If-Modified-Since')
    if (ifModifiedSince && updatedAt === ifModifiedSince) return res.status(304).send()
    res.setHeader('Last-Modified', updatedAt)
  }
  res.send(line)
}

export const deleteLine = async (req: RequestWithRestDataset & { params: { lineId: string } }, res: Response, next: NextFunction) => {
  const [operation] = (await applyReqTransactions(req, [{ _action: 'delete', _id: req.params.lineId }], compileSchema(req.dataset, !!reqUserAuthenticated(req).adminMode))).operations
  if (operation._error) return res.status(operation._status ?? 200).send(operation._error)
  await commitLines(req.dataset, [req.params.lineId])

  await import('@data-fair/lib-express/events-log.js')
    .then((eventsLog) => eventsLog.default.info('df.datasets.rest.deleteLine', `deleted line ${operation._id} from dataset ${req.dataset.slug} (${req.dataset.id})`, { req, account: req.dataset.owner as Account }))

  // TODO: delete the attachment if it is the primary key ?
  res.status(204).send()
  storageUtils.updateStorage(req.dataset).catch((err) => console.error('failed to update storage after deleteLine', err))
}

export const createOrUpdateLine = async (req: RequestWithRestDataset, res: Response, next: NextFunction) => {
  if (req.linesOwner) Object.assign(req.body, linesOwnerCols(req.linesOwner))
  const definedId = req.params.lineId || req.body._id || getLineId(req.body, req.dataset, true)
  req.body._id = definedId || nanoid()
  await manageAttachment(req, false)

  const fullLine = { _action: 'createOrUpdate', ...req.body }
  formatLine(fullLine, req.dataset.schema)

  const [operation] = (await applyReqTransactions(req, [fullLine], compileSchema(req.dataset, !!reqUserAuthenticated(req).adminMode))).operations
  if (operation._error) return res.status(operation._status ?? 200).send(operation._error)
  await commitLines(req.dataset, [fullLine._id])

  await import('@data-fair/lib-express/events-log.js')
    .then((eventsLog) => eventsLog.default.info('df.datasets.rest.createOrUpdateLine', `updated or created line ${operation._id} from dataset ${req.dataset.slug} (${req.dataset.id})`, { req, account: req.dataset.owner as Account }))

  const line = getLineFromOperation(operation, req._rawBody ?? req.body)
  res.status(operation._status || (definedId ? 200 : 201)).send(cleanLine(line))
  storageUtils.updateStorage(req.dataset).catch((err) => console.error('failed to update storage after updateLine', err))
}

export const patchLine = async (req: RequestWithRestDataset, res: Response, next: NextFunction) => {
  await manageAttachment(req, true)
  const fullLine = { _action: 'patch', _id: req.params.lineId, ...req.body }
  formatLine(fullLine, req.dataset.schema)

  const [operation] = (await applyReqTransactions(req, [fullLine], compileSchema(req.dataset, !!reqUserAuthenticated(req).adminMode))).operations
  if (operation._error) return res.status(operation._status ?? 200).send(operation._error)
  await commitLines(req.dataset, [fullLine._id])

  await import('@data-fair/lib-express/events-log.js')
    .then((eventsLog) => eventsLog.default.info('df.datasets.rest.patchLine', `patched line ${operation._id} from dataset ${req.dataset.slug} (${req.dataset.id})`, { req, account: req.dataset.owner as Account }))

  const line = getLineFromOperation(operation, req._rawBody ?? req.body)
  res.status(200).send(cleanLine(line))
  storageUtils.updateStorage(req.dataset).catch((err) => console.error('failed to update storage after patchLine', err))
}

export const deleteAllLines = async (req: RequestWithRestDataset, res: Response, next: NextFunction) => {
  await initDataset(req.dataset)
  const indexName = await initDatasetIndex(req.dataset)
  await switchAlias(req.dataset, indexName)

  await import('@data-fair/lib-express/events-log.js')
    .then((eventsLog) => eventsLog.default.info('df.datasets.rest.deleteAllLines', `deleted all lines from dataset ${req.dataset.slug} (${req.dataset.id})`, { req, account: req.dataset.owner as Account }))

  await mongo.datasets.updateOne({ id: req.dataset.id }, { $set: { _partialRestStatus: 'updated' } })

  res.status(204).send()
  storageUtils.updateStorage(req.dataset).catch((err) => console.error('failed to update storage after deleteAllLines', err))
}

type ReqFile = { filename: string, originalname: string, mimetype: string, path: string }

export const bulkLines = async (req: RequestWithRestDataset & { files?: { attachments?: ReqFile[], actions?: ReqFile[] } }, res: Response, next: NextFunction) => {
  try {
    const validate = compileSchema(req.dataset, !!reqUserAuthenticated(req).adminMode)
    const drop = req.query.drop === 'true'

    // no buffering of this response in the reverse proxy
    res.setHeader('X-Accel-Buffering', 'no')

    // If attachments are sent, add them to the existing ones
    const attachmentsFile = req.files?.attachments?.[0]
    if (attachmentsFile) {
      await mongo.datasets.updateOne({ id: req.dataset.id }, { $push: { _newRestAttachments: (drop ? 'drop:' : '') + attachmentsFile.filename } })
    }

    // The list of actions/operations/transactions is either in a "actions" file
    // or directly in the body
    let inputStream, mimeType, skipDecoding
    const transactionSchema = [...req.dataset.schema, { key: '_id', type: 'string' }, { key: '_action', type: 'string' }]
    let fileProps = {
      fieldsDelimiter: req.query.sep || ',',
      escape: '"',
      quote: '"',
      newline: '\n'
    }
    if (req.files && req.files.actions && req.files.actions.length) {
      mimeType = mime.lookup(req.files.actions[0].originalname) || 'application/x-ndjson'

      if (req.files.actions[0].mimetype === 'application/zip') {
        // handle .zip archive
        const directory = await unzipper.Open.file(req.files.actions[0].path)
        if (directory.files.length !== 1) return res.status(400).type('text/plain').send('only accept zip archive with a single file inside')
        mimeType = mime.lookup(directory.files[0].path)
        inputStream = directory.files[0].stream()
      } else if (tabularTypes.has(req.files.actions[0].mimetype)) {
        const actionFile = req.files.actions[0]
        const destination = actionFile.path + '.csv'
        await sheet2csvPiscina.run({
          source: req.files.actions[0].path,
          destination
        })
        req.files.actions.push({
          originalname: actionFile.originalname + '.csv',
          filename: actionFile.filename + '.csv',
          mimetype: 'text/csv',
          path: destination
        })
        inputStream = fs.createReadStream(destination)
        mimeType = 'text/csv'
        fileProps = { fieldsDelimiter: ',', escape: '"', quote: '"', newline: '\n' }
      } else {
        inputStream = fs.createReadStream(req.files.actions[0].path)
        // handle .csv.gz file or other .gz files
        if (req.files.actions[0].originalname.endsWith('.gz')) {
          mimeType = mime.lookup(req.files.actions[0].originalname.slice(0, -3))
          if (mimeType) mimeType += '+gzip'
        }
      }
    } else {
      inputStream = req
      skipDecoding = true
      const contentType = req.get('Content-Type')
      mimeType = (contentType && contentType.split(';')[0]) || 'application/json'
    }

    if (!mimeType) return res.status(400).type('text/plain').send('unknown file extension')

    let tmpDataset: RestDataset | undefined
    if (drop) {
      tmpDataset = { ...req.dataset, id: req.dataset.id + '-' + nanoid() + '-tmp-bulk' }
      await initDataset(tmpDataset)
    }

    // these formats are read strictly as is
    const raw = mimeType === 'application/x-ndjson' || mimeType === 'application/json'

    const parseStreams = transformFileStreams(mimeType, transactionSchema, null, fileProps, raw, true, null, skipDecoding, req.dataset, true, false)

    const summary = initSummary()
    const transactionStream = new TransactionStream({ dataset: req.dataset, sessionState: reqSessionAuthenticated(req), linesOwner: req.linesOwner, validate, summary, tmpDataset })

    // we try both to have a HTTP failure if the transactions are clearly badly formatted
    // and also to start writing in the HTTP response as soon as possible to limit the timeout risks
    // this is accomplished partly by the keepalive option to async-wrap (see in the datasets router)
    let firstBatch = true
    transactionStream.on('batch', () => {
      if (firstBatch) {
        res.writeHead(!summary.nbOk && summary.nbErrors ? 400 : 200, { 'Content-Type': 'application/json' })
        firstBatch = false
      } else {
        res.write(' ')
      }
    })

    try {
      await pump(
        inputStream,
        ...parseStreams,
        transactionStream
      )
      if (drop && tmpDataset) {
        if (summary.nbErrors) {
          summary.cancelled = true
          await collection(tmpDataset).drop()
        } else {
          await createTmpMissingRevisions(tmpDataset, req.dataset, reqSessionAuthenticated(req))
          await collection(req.dataset).drop()
          await collection(tmpDataset).rename(collectionName(req.dataset))
          summary.dropped = true
          await mongo.datasets.updateOne({ id: req.dataset.id }, { $set: { status: 'analyzed' } })
        }
      } else {
        const contentLength = Number(req.get('content-length'))
        if (!attachmentsFile && req.query.async !== 'true' && !isNaN(contentLength) && contentLength <= config.elasticsearch.maxBulkChars && summary._ids.size <= config.elasticsearch.maxBulkLines) {
          await commitLines(req.dataset, [...summary._ids])
          summary.indexedAt = new Date().toISOString()
        } else {
          await mongo.datasets.updateOne({ id: req.dataset.id }, { $set: { _partialRestStatus: 'updated' } })
        }
      }
    } catch (err: any) {
      const status = err.status ?? err.statusCode ?? 500
      if (status === 500) internalError('bulk-lines', err)
      if (firstBatch) {
        res.writeHead(status, { 'Content-Type': 'application/json' })
      }
      summary.nbErrors += 1
      summary.errors.push({ line: -1, error: err.message, status })

      if (drop) {
        summary.cancelled = true
        if (tmpDataset) await collection(tmpDataset).drop()
      }
    }
    for (const warning of parseStreams.map(p => p.__warning)) {
      if (warning) {
        summary.nbWarnings += 1
        summary.warnings.push({ line: -1, warning })
      }
    }

    const result: any = { ...summary }
    delete result._ids

    await import('@data-fair/lib-express/events-log.js')
      .then((eventsLog) => eventsLog.default.info('df.datasets.rest.bulkLines', `applied operations in bulk to dataset ${req.dataset.slug} (${req.dataset.id}), ${JSON.stringify(result)}`, { req, account: req.dataset.owner as Account }))

    res.write(JSON.stringify(result, null, 2))
    res.end()

    storageUtils.updateStorage(req.dataset).catch((err) => console.error('failed to update storage after bulkLines', err))
  } finally {
    for (const file of req.files?.actions || []) {
      await fs.unlink(file.path)
    }
  }
}

export const syncAttachmentsLines = async (req: RequestWithRestDataset, res: Response, next: NextFunction) => {
  const dataset = req.dataset
  const validate = compileSchema(dataset, !!reqUserAuthenticated(req).adminMode)

  const pathField = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  if (!pathField) {
    throw httpError(400, 'Le schéma ne prévoit pas de pièce jointe')
  }
  if (!dataset.primaryKey || dataset.primaryKey.length !== 1 || dataset.primaryKey[0] !== pathField.key) {
    throw httpError(400, 'Le schéma ne définit par le chemin de la pièce jointe comme clé primaire')
  }

  const files = await lsAttachments(dataset)
  const toDelete = await collection(dataset)
    .find({ [pathField.key]: { $nin: files } })
    .limit(10000).project({ [pathField.key]: 1 }).toArray()

  const filesStream = new Readable({ objectMode: true })
  for (const file of files) {
    filesStream.push({ [pathField.key]: file })
  }
  for (const doc of toDelete) {
    filesStream.push({ ...doc, _action: 'delete' })
  }
  filesStream.push(null)

  const summary = initSummary()
  const transactionStream = new TransactionStream({ dataset: req.dataset, sessionState: reqSessionAuthenticated(req), linesOwner: req.linesOwner, validate, summary })
  await pump(filesStream, transactionStream)

  await mongo.datasets.updateOne({ id: req.dataset.id }, { $set: { _partialRestStatus: 'updated' } })
  await storageUtils.updateStorage(req.dataset)

  res.send(summary)
}

export const readRevisions = async (req: RequestWithRestDataset, res: Response, next: NextFunction) => {
  if (!req.dataset.rest.history) {
    return res.status(400).type('text/plain').send('L\'historisation des lignes n\'est pas activée pour ce jeu de données.')
  }
  const rc = revisionsCollection(req.dataset)
  const filter: Filter<DatasetLineRevision> = req.params.lineId ? { _lineId: req.params.lineId } : {}
  if (req.linesOwner) Object.assign(filter, linesOwnerFilter(req.linesOwner))
  const countFilter = { ...filter }
  if (req.query.before && typeof req.query.before === 'string') filter._i = { $lt: parseInt(req.query.before) }

  const [, size] = findUtils.pagination(req.query)
  const [total, results] = await Promise.all([
    rc.countDocuments(countFilter),
    rc.find(filter).sort({ _i: -1 }).limit(size).project({}).toArray()
  ])
  for (const r of results) {
    r._id = r._lineId
    delete r._lineId
  }

  const response: { total: number, results: Partial<DatasetLineRevision>[], next?: string } = { total, results }

  if (size && results.length === size) {
    const nextLinkURL = new URL(`${req.publicBaseUrl}${req.originalUrl}`)
    for (const key of Object.keys(req.query)) {
      if (key !== 'page') nextLinkURL.searchParams.set(key, req.query[key])
    }
    nextLinkURL.searchParams.set('before', results[results.length - 1]._i)
    const link = new LinkHeader()
    link.set({ rel: 'next', uri: nextLinkURL.href })
    res.set('Link', link.toString())
    response.next = nextLinkURL.href
  }

  res.send(response)
}

export const readStreams = async (dataset: RestDataset, filter = {}, progress?: { inc: (i: number) => void }) => {
  const c = collection(dataset)
  let inc: number
  if (progress) {
    const count = await c.countDocuments(filter)
    inc = 100 / count
  }
  return [
    c.find(filter).batchSize(100).stream(),
    new Transform({
      objectMode: true,
      transform (chunk, encoding, cb) {
        if (progress) progress.inc(inc)
        // now _i should always be defined, but keep the OR for retro-compatibility
        chunk._i = chunk._i || chunk._updatedAt.getTime()
        cb(null, chunk)
      }
    })
  ]
}

export const writeExtendedStreams = (dataset: RestDataset, extensions: RestDataset['extensions']) => {
  const patchedKeys: string[] = []
  for (const extension of extensions ?? []) {
    if (extension.type === 'remoteService' && extension.propertyPrefix) {
      patchedKeys.push(extension.propertyPrefix)
      if (extension.overwrite) {
        for (const key in extension.overwrite) {
          // @ts-ignore
          if (extension.overwrite[key]['x-originalName']) {
            // @ts-ignore
            patchedKeys.push(fieldsSniffer.escapeKey(extension.overwrite[key]['x-originalName']))
          }
        }
      }
    }
    if (extension.type === 'exprEval') patchedKeys.push(extension.property.key)
  }
  const c = collection(dataset)
  return [new Writable({
    objectMode: true,
    async write (item, encoding, cb) {
      try {
        const patch: UpdateFilter<DatasetLine> = { $set: { _needsIndexing: true }, $unset: { _needsExtending: 1 } }
        for (const key of patchedKeys) {
          if (key in item && patch.$set) patch.$set[key] = item[key]
          else if (patch.$unset) patch.$unset[key] = item[key]
        }
        await c.updateOne({ _id: item._id }, patch)
        cb()
      } catch (err: any) {
        cb(err)
      }
    }
  })]
}

class MarkIndexedStream extends Writable {
  c: Collection<DatasetLine>
  i: number = 0
  bulkOp: UnorderedBulkOperation | null = null

  constructor (dataset: RestDataset) {
    super({ objectMode: true })
    this.c = collection(dataset)
  }

  async _write (chunk: DatasetLine, encoding: BufferEncoding, cb: (error?: Error) => void) {
    try {
      this.i = this.i || 0
      this.bulkOp = this.bulkOp || this.c.initializeUnorderedBulkOp()
      const line = await this.c.findOne({ _id: chunk._id })
      // if the line was updated in the interval since reading for indexing
      // do not mark it as properly indexed
      if (chunk._updatedAt && line?._updatedAt && chunk._updatedAt.getTime() === line._updatedAt.getTime()) {
        this.i += 1
        if (chunk._deleted) {
          this.bulkOp.find({ _id: chunk._id }).deleteOne()
        } else {
          this.bulkOp.find({ _id: chunk._id }).updateOne({ $unset: { _needsIndexing: '' } })
        }
      }
      if (this.i === config.mongo.maxBulkOps) {
        await this.bulkOp.execute()
        this.i = 0
        this.bulkOp = null
      }
      cb()
    } catch (err: any) {
      cb(err)
    }
  }

  async _final (cb: (err?: Error) => void) {
    try {
      if (this.bulkOp && this.i) await this.bulkOp.execute()
      cb()
    } catch (err: any) {
      cb(err)
    }
  }
}

export const markIndexedStream = (dataset: RestDataset) => {
  return new MarkIndexedStream(dataset)
}

export const count = (dataset: RestDataset, filter?: Filter<DatasetLine>) => {
  const c = collection(dataset)
  if (filter) return c.countDocuments(filter)
  else return c.estimatedDocumentCount()
}

export const applyTTL = async (dataset: RestDataset) => {
  if (!dataset.rest.ttl) return
  const qs = `${dataset.rest.ttl.prop}:[* TO ${moment().subtract(dataset.rest.ttl.delay.value, dataset.rest.ttl.delay.unit).toISOString()}]`

  const summary = initSummary()
  // @ts-ignore
  const iter = iterHits(dataset, { size: 1000, qs })
  await pump(
    Readable.from(iter),
    // @ts-ignore
    new Transform({
      objectMode: true,
      transform (hits, encoding, callback) {
        for (const hit of hits) {
          this.push({ _action: 'delete', _id: hit._id })
        }
        callback(null)
      }
    }),
    new TransactionStream({ dataset, summary })
  )
  const patch: UpdateFilter<RestDataset> = { 'rest.ttl.checkedAt': new Date().toISOString() }
  if (summary.nbOk) patch._partialRestStatus = 'updated'

  await mongo.datasets
    .updateOne({ id: dataset.id }, { $set: patch })
}
