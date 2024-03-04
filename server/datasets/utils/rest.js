const config = /** @type {any} */(require('config'))
const crypto = require('node:crypto')
const fs = require('fs-extra')
const path = require('path')
const createError = require('http-errors')
const { nanoid } = require('nanoid')
const pump = require('../../misc/utils/pipe')
const ajv = require('../../misc/utils/ajv')
const multer = require('multer')
const mime = require('mime-types')
const { Readable, Transform, Writable } = require('stream')
const moment = require('moment')
const { crc32 } = require('crc')
const stableStringify = require('fast-json-stable-stringify')
const LinkHeader = require('http-link-header')
const unzipper = require('unzipper')
const dayjs = require('dayjs')
const duration = require('dayjs/plugin/duration')
dayjs.extend(duration)
const storageUtils = require('./storage')
const attachmentsUtils = require('./attachments')
const findUtils = require('../../misc/utils/find')
const observe = require('../../misc/utils/observe')
const fieldsSniffer = require('./fields-sniffer')
const { transformFileStreams } = require('./data-streams')
const { attachmentPath, lsAttachments } = require('./files')
const { jsonSchema } = require('./schema')
const { tmpDir } = require('./files')
const esUtils = require('../../datasets/es')
const { tabularTypes } = require('../../workers/file-normalizer')
const Piscina = require('piscina')

const sheet2csvPiscina = new Piscina({
  filename: path.resolve(__dirname, '../threads/sheet2csv.js'),
  maxThreads: 1
})

const actions = ['create', 'update', 'createOrUpdate', 'patch', 'delete']

function cleanLine (line) {
  delete line._needsIndexing
  delete line._needsExtending
  delete line._deleted
  delete line._action
  delete line._error
  delete line._hash
  return line
}

const destination = async (req, file, cb) => {
  try {
    await fs.ensureDir(tmpDir)
    cb(null, tmpDir)
  } catch (err) {
    cb(err)
  }
}

const filename = async (req, file, cb) => {
  try {
    const uid = nanoid()
    // creating empty file before streaming seems to fix some weird bugs with NFS
    await fs.ensureFile(path.join(tmpDir, uid))
    cb(null, uid)
  } catch (err) {
    cb(err)
  }
}

const padISize = (config.mongo.maxBulkOps - 1).toString().length
// cf https://github.com/puckey/pad-number/blob/master/index.js
const padI = (i) => {
  const str = i.toString()
  return new Array((padISize - str.length) + 1).join('0') + str
}

exports.uploadAttachment = multer({
  storage: multer.diskStorage({ destination, filename })
}).single('attachment')

exports.uploadBulk = multer({
  storage: multer.diskStorage({ destination, filename })
}).fields([{ name: 'attachments', maxCount: 1 }, { name: 'actions', maxCount: 1 }])

exports.collectionName = (dataset) => 'dataset-data-' + dataset.id
exports.collection = (db, dataset) => db.collection(exports.collectionName(dataset))

exports.revisionsCollectionName = (dataset) => 'dataset-revisions-' + dataset.id
exports.revisionsCollection = (db, dataset) => db.collection(exports.revisionsCollectionName(dataset))

exports.initDataset = async (db, dataset) => {
  // just in case of badly cleaned data from previous dataset with same id
  try {
    await exports.deleteDataset(db, dataset)
  } catch (err) {
    // nothing
  }
  const collection = exports.collection(db, dataset)
  await Promise.all([
    collection.createIndex({ _needsIndexing: 1 }, { sparse: true }),
    collection.createIndex({ _needsExtending: 1 }, { sparse: true }),
    collection.createIndex({ _i: -1 }, { unique: true })
  ])
}

exports.configureHistory = async (app, dataset) => {
  const db = app.get('db')
  const revisionsCollectionExists = (await db.listCollections({ name: exports.revisionsCollectionName(dataset) }).toArray()).length === 1
  if (!dataset.rest.history) {
    if (revisionsCollectionExists) {
      await exports.revisionsCollection(db, dataset).drop()
      await storageUtils.updateStorage(app, dataset)
    }
  } else {
    const revisionsCollection = exports.revisionsCollection(db, dataset)
    if (!revisionsCollectionExists) {
      // create revisions collection and fill it with initial state
      await revisionsCollection.createIndex({ _lineId: 1, _i: -1 })
      let revisionsBulkOp = revisionsCollection.initializeUnorderedBulkOp()
      for await (const line of exports.collection(db, dataset).find()) {
        const revision = { ...line, _action: 'create' }
        delete revision._needsIndexing
        delete revision._needsExtending
        revision._lineId = revision._id
        delete revision._id
        if (!revision._deleted) delete revision._deleted
        revisionsBulkOp.insert(revision)
        if (revisionsBulkOp.length >= config.mongo.maxBulkOps) {
          await revisionsBulkOp.execute()
          revisionsBulkOp = revisionsCollection.initializeUnorderedBulkOp()
        }
      }
      if (revisionsBulkOp.length) await revisionsBulkOp.execute()
      await storageUtils.updateStorage(app, dataset)
    }

    // manage history TTL
    if (dataset.rest.historyTTL && dataset.rest.historyTTL.active && dataset.rest.historyTTL.delay && dataset.rest.historyTTL.delay.value) {
      const expireAfterSeconds = dayjs.duration(dataset.rest.historyTTL.delay.value, dataset.rest.historyTTL.delay.unit || 'days').asSeconds()
      await revisionsCollection.createIndex({ _updatedAt: 1 }, { expireAfterSeconds, name: 'history-ttl' })
    } else {
      try {
        await revisionsCollection.dropIndex('history-ttl')
      } catch (err) {
        if (err.codeName !== 'IndexNotFound') throw err
      }
    }
  }
}

exports.deleteDataset = async (db, dataset) => {
  await exports.collection(db, dataset).drop()
  const revisionsCollectionExists = (await db.listCollections({ name: exports.revisionsCollectionName(dataset) }).toArray()).length === 1
  if (revisionsCollectionExists) exports.revisionsCollection(db, dataset).drop()
}

const getLineId = (line, dataset) => {
  if (dataset.primaryKey && dataset.primaryKey.length) {
    const primaryKey = dataset.primaryKey.map(p => line[p] + '')
    if (dataset.rest?.primaryKeyMode === 'sha256') {
      return crypto.createHash('sha256').update(JSON.stringify(primaryKey)).digest('hex')
    } else {
      // base64 by default for retro-compatibility
      return Buffer.from(JSON.stringify(primaryKey).slice(2, -2)).toString('hex')
    }
  }
}

const linesOwnerCols = (linesOwner) => {
  if (!linesOwner) return {}
  const cols = { _owner: linesOwner.type + ':' + linesOwner.id }
  if (linesOwner.department) cols._owner += ':' + linesOwner.department
  if (linesOwner.name) {
    cols._ownerName = linesOwner.name
    if (linesOwner.departmentName) cols._ownerName += ` (${linesOwner.department})`
  }
  return cols
}
const linesOwnerFilter = (linesOwner) => {
  if (!linesOwner) return {}
  const cols = linesOwnerCols(linesOwner)
  return { _owner: cols._owner }
}
/**
 * @param {any} body
 * @returns {string}
 */
const getLineHash = (body) => {
  return crc32(stableStringify(body)).toString(16)
}

/** @typedef {{_id: string, _action: string, body: any, fullBody: any, filter: {_id: string}, _status?: number, _error?: string}} Operation */

/**
 * @param {Operation} operation
 * @returns {any}
 */
const getLineFromOperation = (operation) => {
  const line = { ...operation, ...operation.fullBody }
  delete line.body
  delete line.fullBody
  delete line.filter
  return line
}

/**
 * @param {import('mongodb').Db} db
 * @param {any} tmpDataset
 * @param {any} dataset
 * @param {string[]} existingIds
 * @param {any} user
 */
const checkMissingIdsRevisions = async (db, tmpDataset, dataset, existingIds, user) => {
  const missingIds = new Set(existingIds)
  for await (const stillExistingDoc of exports.collection(db, tmpDataset).find({ _id: { $in: existingIds } })) {
    missingIds.delete(stillExistingDoc._id)
  }
  if (missingIds.size) {
    const updatedAt = new Date()
    const datasetCreatedAt = new Date(dataset.createdAt).getTime()
    let i = 0
    const revisionsBulkOp = exports.revisionsCollection(db, dataset).initializeUnorderedBulkOp()
    for await (const missingDoc of exports.collection(db, dataset).find({ _id: { $in: [...missingIds] } }).project(getPrimaryKeyProjection(dataset))) {
      i++
      if (missingDoc._deleted) continue
      const revision = {
        _action: 'delete',
        _updatedAt: updatedAt,
        ...missingDoc,
        _i: Number((updatedAt.getTime() - datasetCreatedAt) + padI(i)),
        _deleted: true,
        _hash: null,
        _lineId: missingDoc._id
      }
      delete revision._id
      if (user && dataset.rest.storeUpdatedBy) {
        revision._updatedBy = user.id
        revision._updatedByName = user.name
      }
      delete revision._needsIndexing
      delete revision._needsExtending
      revisionsBulkOp.insert(revision)
    }
    await revisionsBulkOp.execute()
  }
}

/**
 * @param {import('mongodb').Db} db
 * @param {any} tmpDataset
 * @param {any} dataset
* @param {any} user
 */
const createTmpMissingRevisions = async (db, tmpDataset, dataset, user) => {
  /** @type {string[]} */
  let existingIds = []

  for await (const existingDoc of exports.collection(db, dataset).find({}).project({ _id: 1 })) {
    existingIds.push(existingDoc._id)
    if (existingIds.length === 1000) {
      await checkMissingIdsRevisions(db, tmpDataset, dataset, existingIds, user)
      existingIds = []
    }
  }
  if (existingIds.length) await checkMissingIdsRevisions(db, tmpDataset, dataset, existingIds, user)
}

/**
 * @param {any} dataset
 */
const getPrimaryKeyProjection = (dataset) => {
  const primaryKeyProjection = { _id: 1, _hash: 1, _deleted: 1 }
  if (dataset.primaryKey && dataset.primaryKey.length) {
    for (const key of dataset.primaryKey) primaryKeyProjection[key] = 1
  }
  return primaryKeyProjection
}

exports.applyTransactions = async (db, dataset, user, transacs, validate, linesOwner, tmpDataset) => {
  const datasetCreatedAt = new Date(dataset.createdAt).getTime()
  const updatedAt = new Date()
  const collection = exports.collection(db, tmpDataset || dataset)
  const revisionsCollection = exports.revisionsCollection(db, dataset)
  const history = dataset.rest && dataset.rest.history
  const patchProjection = { _id: 1, _hash: 1, _deleted: 1 }
  for (const prop of dataset.schema) {
    if (!prop['x-calculated'] && !prop['x-extension']) {
      patchProjection[prop.key] = 1
    }
  }
  const primaryKeyProjection = getPrimaryKeyProjection(dataset)

  // prepare future results that will be completed by the following loops
  /** @type {Operation[]} */
  const operations = []
  let i = 0
  const patchPreviousFilters = []
  const deletePreviousFilters = []
  for (const transac of transacs) {
    const { _action, ...body } = transac
    if (!actions.includes(_action)) throw createError(400, `action "${_action}" is unknown, use one of ${JSON.stringify(actions)}`)
    Object.assign(body, linesOwnerCols(linesOwner))
    if (!body._id) throw createError(400, '"_id" attribute is required')

    const operation = {
      _id: body._id,
      _action,
      body,
      fullBody: { ...body },
      filter: { _id: body._id, ...linesOwnerFilter(linesOwner) }
    }
    operations.push(operation)

    if (dataset.extensions && dataset.extensions.find(e => e.active)) {
      operation.fullBody._needsExtending = true
    } else {
      operation.fullBody._needsIndexing = true
    }
    operation.fullBody._updatedAt = body._updatedAt ? new Date(body._updatedAt) : updatedAt
    operation.fullBody._i = Number((new Date(operation.fullBody._updatedAt).getTime() - datasetCreatedAt) + padI(i))
    i++
    // lots of objects to process, so we yield to the event loop every 100 lines
    if (i % 100 === 0) await new Promise(resolve => setImmediate(resolve))

    if (user && dataset.rest.storeUpdatedBy) {
      operation.fullBody._updatedBy = user.id
      operation.fullBody._updatedByName = user.name
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
    for await (const patchPrevious of collection.find({ $or: patchPreviousFilters }).project(patchProjection)) {
      const { _id, _hash, _deleted, ...previousBody } = patchPrevious
      if (!_deleted) {
        missingPatchPrevious.delete(_id)
        const operation = operations.find(op => op._id === _id)
        if (operation) {
          operation.body = { ...previousBody, ...operation.body }
          Object.assign(operation.fullBody, operation.body)
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
    for await (const deletePrevious of collection.find({ $or: deletePreviousFilters }).project(primaryKeyProjection)) {
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
    if (validate) {
      v++
      // validation can be CPU intensive, so we yield to the event loop every 100 lines
      if (v % 100 === 0) await new Promise(resolve => setImmediate(resolve))
    }
    const primaryKeyId = getLineId(operation.body, dataset)
    if (primaryKeyId && operation._id !== primaryKeyId) {
      operation._status = 400
      operation._error = 'identifiant de ligne incompatible avec la clé primaire'
    } else if (validate && !validate(operation.body)) {
      operation._error = validate.errors
      operation._status = 400
    } else if (operation._action !== 'patch') {
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
    for await (const checkPrevious of collection.find({ $or: createUpdatePreviousFilters }).project({ _id: 1, _hash: 1, _deleted: 1 })) {
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
  const bulkOp = collection.initializeUnorderedBulkOp()
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
    } catch (err) {
      if (!err.writeErrors) throw err
      for (const writeError of err.writeErrors) {
        const operation = bulkOpMatchingOperations[writeError.err.index]
        if (writeError.err.code === 11000) {
          if (operation._action === 'create') {
            operation._status = 409
            operation._error = 'cet identifiant de ligne est déjà utilisé'
          }
          if (operation._action === 'createOrUpdate') {
            // this conflict means that the hash was unchanged
            operation._status = 304
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
    const revisionsBulkOp = revisionsCollection.initializeUnorderedBulkOp()
    let h = 0
    for (const operation of operations) {
      if (operation._status && operation._status >= 300) continue
      h++
      // lots of objects to process, so we yield to the event loop every 100 lines
      if (h % 100 === 0) await new Promise(resolve => setImmediate(resolve))
      const revision = getLineFromOperation(operation)
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
  }

  if (user && bulkOpMatchingOperations.length) {
    db.collection('datasets').updateOne(
      { id: dataset.id },
      { $set: { dataUpdatedAt: updatedAt.toISOString(), dataUpdatedBy: { id: user.id, name: user.name } } })
  }

  return { operations, bulkOpResult }
}

/**
 * @param {*} req
 * @param {*} transacs
 * @param {*} validate
 * @param {any} [tmpDataset]
 * @returns {{operations: Operation[], bulkOpResult: any}}
 */
const applyReqTransactions = (req, transacs, validate, tmpDataset) => {
  return exports.applyTransactions(req.app.get('db'), req.dataset, req.user, transacs, validate, req.linesOwner, tmpDataset)
}

const initSummary = () => ({ nbOk: 0, nbNotModified: 0, nbErrors: 0, nbCreated: 0, nbModified: 0, nbDeleted: 0, errors: [] })

class TransactionStream extends Writable {
  constructor (options) {
    super({ objectMode: true })
    this.options = options
    this.i = 0
    this.transactions = []
  }

  async _applyTransactions () {
    const { operations, bulkOpResult } = await applyReqTransactions(this.options.req, this.transactions, this.options.validate, this.options.tmpDataset)

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
          this.options.summary.errors.push({ line: this.i, error: operation._error, status: operation._status })
        }
      } else {
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

  async _write (chunk, encoding, cb) {
    try {
      chunk._action = chunk._action || 'createOrUpdate'
      delete chunk._i
      if (['create', 'createOrUpdate'].includes(chunk._action) && !chunk._id) {
        chunk._id = getLineId(chunk, this.options.req.dataset) || nanoid()
      }
      if (chunk._action === 'delete' && !chunk._id) { // delete by primary key
        chunk._id = getLineId(chunk, this.options.req.dataset)
      }

      // prevent working twice on a line in the same bulk, this way sequentiality doesn't matter and we can use mongodb unordered bulk
      if (chunk._id && this.transactions.find(c => c._id === chunk._id)) await this._applyTransactions()

      this.transactions.push(chunk)

      // WARNING: changing this number has impact on the _i generation logic
      if (this.transactions.length > config.mongo.maxBulkOps) await this._applyTransactions()
    } catch (err) {
      return cb(err)
    }
    cb()
  }

  _final (cb) {
    // use then syntax cf https://github.com/nodejs/node/issues/39535
    this._applyTransactions().then(() => cb(), cb)
  }
}

const compileSchema = (dataset, adminMode) => {
  const schema = jsonSchema(dataset.schema.filter(p => !p['x-calculated'] && !p['x-extension']))
  schema.additionalProperties = false
  schema.properties._id = { type: 'string' }
  // super-admins can set _updatedAt and so rewrite history
  if (adminMode) schema.properties._updatedAt = { type: 'string', format: 'date-time' }
  return ajv.compile(schema, false)
}

async function checkMatchingAttachment (req, lineId, dir, pathField) {
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

async function manageAttachment (req, keepExisting) {
  if (req.is('multipart/form-data')) {
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
    await fs.emptyDir(dir)
    const relativePath = path.join(lineId, req.file.originalname)
    await fs.rename(req.file.path, attachmentPath(req.dataset, relativePath))
    if (!pathField) {
      throw createError(400, 'Le schéma ne prévoit pas d\'associer une pièce jointe')
    }
    req.body[pathField.key] = relativePath
  } else if (!keepExisting) {
    if (!checkMatchingAttachment(req, lineId, dir, pathField)) {
      await fs.remove(dir)
    }
  }
}

exports.readLine = async (req, res, next) => {
  const db = req.app.get('db')
  const collection = exports.collection(db, req.dataset)
  const line = await collection.findOne({ _id: req.params.lineId, ...linesOwnerFilter(req.linesOwner) })
  if (!line) return res.status(404).send('Identifiant de ligne inconnu')
  if (line._deleted) return res.status(404).send('Identifiant de ligne inconnu')
  cleanLine(line)
  const updatedAt = (new Date(line._updatedAt)).toUTCString()
  const ifModifiedSince = req.get('If-Modified-Since')
  if (ifModifiedSince && updatedAt === ifModifiedSince) return res.status(304).send()
  res.setHeader('Last-Modified', updatedAt)
  res.send(line)
}

exports.deleteLine = async (req, res, next) => {
  const db = req.app.get('db')
  const [operation] = (await applyReqTransactions(req, [{ _action: 'delete', _id: req.params.lineId }], compileSchema(req.dataset, req.user.adminMode))).operations
  if (operation._error) return res.status(operation._status).send(operation._error)
  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  // TODO: delete the attachment if it is the primary key ?
  res.status(204).send()
  storageUtils.updateStorage(req.app, req.dataset).catch((err) => console.error('failed to update storage after deleteLine', err))
}

exports.createOrUpdateLine = async (req, res, next) => {
  const db = req.app.get('db')
  req.body._action = req.body._action ?? 'createOrUpdate'
  const definedId = req.params.lineId || req.body._id || getLineId(req.body, req.dataset)
  req.body._id = definedId || nanoid()
  Object.assign(req.body, linesOwnerCols(req.linesOwner))
  await manageAttachment(req, false)
  const [operation] = (await applyReqTransactions(req, [req.body], compileSchema(req.dataset, req.user.adminMode))).operations
  if (operation._error) return res.status(operation._status).send(operation._error)
  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  const line = getLineFromOperation(operation)
  res.status(line._status || (definedId ? 200 : 201)).send(cleanLine(line))
  storageUtils.updateStorage(req.app, req.dataset).catch((err) => console.error('failed to update storage after updateLine', err))
}

exports.patchLine = async (req, res, next) => {
  const db = req.app.get('db')
  await manageAttachment(req, true)
  const [operation] = (await applyReqTransactions(req, [{ _action: 'patch', _id: req.params.lineId, ...req.body }], compileSchema(req.dataset, req.user.adminMode))).operations
  if (operation._error) return res.status(operation._status).send(operation._error)
  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  const line = getLineFromOperation(operation)
  res.status(200).send(cleanLine(line))
  storageUtils.updateStorage(req.app, req.dataset).catch((err) => console.error('failed to update storage after patchLine', err))
}

exports.deleteAllLines = async (req, res, next) => {
  const db = req.app.get('db')
  const esClient = req.app.get('es')
  await exports.initDataset(db, req.dataset)
  const indexName = await esUtils.initDatasetIndex(esClient, req.dataset)
  await esUtils.switchAlias(esClient, req.dataset, indexName)
  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  res.status(204).send()
  storageUtils.updateStorage(req.app, req.dataset).catch((err) => console.error('failed to update storage after deleteAllLines', err))
}

exports.bulkLines = async (req, res, next) => {
  try {
    const db = req.app.get('db')
    const validate = compileSchema(req.dataset, req.user.adminMode)
    const drop = req.query.drop === 'true'

    // no buffering of this response in the reverse proxy
    res.setHeader('X-Accel-Buffering', 'no')

    // If attachments are sent, add them to the existing ones
    if (req.files && req.files.attachments && req.files.attachments[0]) {
      await attachmentsUtils.addAttachments(req.dataset, req.files.attachments[0])
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
        const destination = req.files.actions[0].path + '.csv'
        await sheet2csvPiscina.run({
          source: req.files.actions[0].path,
          destination
        })
        req.files.actions.push({ path: destination })
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
      mimeType = (req.get('Content-Type') && req.get('Content-Type').split(';')[0]) || 'application/json'
    }

    if (!mimeType) return res.status(400).type('text/plain').send('unknown file extension')

    let tmpDataset
    if (drop) {
      tmpDataset = { ...req.dataset, id: req.dataset.id + '-' + nanoid() + '-tmp-bulk' }
      await exports.initDataset(db, tmpDataset)
    }

    const parseStreams = transformFileStreams(mimeType, transactionSchema, null, fileProps, false, true, null, skipDecoding, null, true)

    const summary = initSummary()
    const transactionStream = new TransactionStream({ req, validate, summary, tmpDataset })

    // we try both to have a HTTP failure if the transactions are clearly badly formatted
    // and also to start writing in the HTTP response as soon as possible to limit the timeout risks
    // this is accomplished partly by the keepalive option to async-wrap (see in the datasets router)
    let firstBatch = true
    transactionStream.on('batch', () => {
      if (firstBatch) {
        res.writeHeader(!summary.nbOk && summary.nbErrors ? 400 : 200, { 'Content-Type': 'application/json' })
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
      if (drop) {
        if (summary.nbErrors) {
          summary.dropCancelled = true
          await exports.collection(db, tmpDataset).drop()
        } else {
          await createTmpMissingRevisions(db, tmpDataset, req.dataset, req.user)
          await exports.collection(db, req.dataset).drop()
          await exports.collection(db, tmpDataset).rename(exports.collectionName(req.dataset))
          summary.dropped = true
          await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'analyzed' } })
        }
      } else {
        await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
      }
    } catch (err) {
      observe.internalError.inc({ errorCode: 'bulk-lines' })
      console.error(`[bulk-lines] failure to apply bulk operation on dataset ${req.dataset.id}`, err)
      if (firstBatch) {
        res.writeHeader(err.statusCode || 500, { 'Content-Type': 'application/json' })
      }
      summary.nbErrors += 1
      summary.errors.push({ line: -1, error: err.message })

      if (drop) {
        summary.dropCancelled = true
        await exports.collection(db, tmpDataset).drop()
      }
    }

    res.write(JSON.stringify(summary, null, 2))
    res.end()

    storageUtils.updateStorage(req.app, req.dataset).catch((err) => console.error('failed to update storage after bulkLines', err))
  } finally {
    for (const file of req.files?.actions || []) {
      await fs.unlink(file.path)
    }
  }
}

exports.syncAttachmentsLines = async (req, res, next) => {
  const db = req.app.get('db')
  const dataset = req.dataset
  const validate = compileSchema(req.dataset, req.user.adminMode)

  const pathField = req.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  if (!pathField) {
    throw createError(400, 'Le schéma ne prévoit pas de pièce jointe')
  }
  if (!dataset.primaryKey || !dataset.primaryKey.length === 1 || dataset.primaryKey[0] !== pathField.key) {
    throw createError(400, 'Le schéma ne définit par le chemin de la pièce jointe comme clé primaire')
  }

  const files = await lsAttachments(dataset)
  const toDelete = await exports.collection(db, dataset)
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
  const transactionStream = new TransactionStream({ req, validate, summary })
  await pump(filesStream, transactionStream)

  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  await storageUtils.updateStorage(req.app, req.dataset)

  res.send(summary)
}

exports.readRevisions = async (req, res, next) => {
  if (!req.dataset.rest || !req.dataset.rest.history) {
    return res.status(400).type('text/plain').send('L\'historisation des lignes n\'est pas activée pour ce jeu de données.')
  }
  const revisionsCollection = exports.revisionsCollection(req.app.get('db'), req.dataset)
  const filter = req.params.lineId ? { _lineId: req.params.lineId } : {}
  Object.assign(filter, linesOwnerFilter(req.linesOwner))
  const countFilter = { ...filter }
  if (req.query.before) filter._i = { $lt: parseInt(req.query.before) }
  // eslint-disable-next-line no-unused-vars
  const [_, size] = findUtils.pagination(req.query)
  const [total, results] = await Promise.all([
    revisionsCollection.countDocuments(countFilter),
    revisionsCollection.find(filter).sort({ _i: -1 }).limit(size).toArray()
  ])
  for (const r of results) {
    r._id = r._lineId
    delete r._lineId
  }

  const response = { total, results }

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

exports.readStreams = async (db, dataset, filter = {}, progress) => {
  const collection = exports.collection(db, dataset)
  let inc
  if (progress) {
    const count = await collection.countDocuments(filter)
    inc = 100 / count
  }
  return [
    collection.find(filter).batchSize(100).stream(),
    new Transform({
      objectMode: true,
      transform (chunk, encoding, cb) {
        if (progress) progress(inc)
        // now _i should always be defined, but keep the OR for retro-compatibility
        chunk._i = chunk._i || chunk._updatedAt.getTime()
        cb(null, chunk)
      }
    })
  ]
}

exports.writeExtendedStreams = (db, dataset) => {
  const collection = exports.collection(db, dataset)
  return [new Writable({
    objectMode: true,
    async write (item, encoding, cb) {
      try {
        delete item._needsExtending
        item._needsIndexing = true
        await collection.replaceOne({ _id: item._id }, item)
        cb()
      } catch (err) {
        cb(err)
      }
    }
  })]
}

exports.markIndexedStream = (db, dataset) => {
  const collection = exports.collection(db, dataset)
  return new Writable({
    objectMode: true,
    async write (chunk, encoding, cb) {
      try {
        this.i = this.i || 0
        this.bulkOp = this.bulkOp || collection.initializeUnorderedBulkOp()
        const line = await collection.findOne({ _id: chunk._id })
        // if the line was updated in the interval since reading for indexing
        // do not mark it as properly indexed
        if (chunk._updatedAt.getTime() === line._updatedAt.getTime()) {
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
      } catch (err) {
        cb(err)
      }
    },
    async final (cb) {
      try {
        if (this.i) await this.bulkOp.execute()
        cb()
      } catch (err) {
        cb(err)
      }
    }
  })
}

exports.count = (db, dataset, filter) => {
  const collection = exports.collection(db, dataset)
  if (filter) return collection.countDocuments(filter)
  else return collection.estimatedDocumentCount()
}

exports.applyTTL = async (app, dataset) => {
  const es = app.get('es')
  const query = `${dataset.rest.ttl.prop}:[* TO ${moment().subtract(dataset.rest.ttl.delay.value, dataset.rest.ttl.delay.unit).toISOString()}]`
  const summary = initSummary()
  await pump(
    new Readable({
      objectMode: true,
      async read () {
        try {
          if (this.reading) return
          this.reading = true
          let { body } = await es.search({
            index: esUtils.aliasName(dataset),
            scroll: '15m',
            size: 1,
            body: {
              query: {
                query_string: { query }
              },
              _source: false
            }
          })
          while (body.hits.hits.length) {
            for (const hit of body.hits.hits) {
              this.push(hit)
            }
            body = (await es.scroll({ scrollId: body._scroll_id, scroll: '15m' })).body
          }
          this.push(null)
        } catch (err) {
          this.emit('error', err)
        }
      }
    }),
    new Transform({
      objectMode: true,
      transform (hit, encoding, callback) {
        return callback(null, { _action: 'delete', _id: hit._id })
      }
    }),
    new TransactionStream({ req: { app, dataset }, summary })
  )
  const patch = { 'rest.ttl.checkedAt': new Date().toISOString() }
  if (summary.nbOk) patch.status = 'updated'

  await app.get('db').collection('datasets')
    .updateOne({ id: dataset.id }, { $set: patch })
}
