const config = require('config')
const fs = require('fs-extra')
const path = require('path')
const createError = require('http-errors')
const { nanoid } = require('nanoid')
const pump = require('../utils/pipe')
const ajv = require('../utils/ajv')
const multer = require('multer')
const mime = require('mime-types')
const { Readable, Transform, Writable } = require('stream')
const moment = require('moment')
const { crc32 } = require('crc')
const stableStringify = require('fast-json-stable-stringify')
const stripBom = require('strip-bom-stream')
const LinkHeader = require('http-link-header')
const unzipper = require('unzipper')
const dayjs = require('dayjs')
const duration = require('dayjs/plugin/duration')
dayjs.extend(duration)
const datasetUtils = require('./dataset')
const attachmentsUtils = require('./attachments')
const findUtils = require('./find')
const fieldsSniffer = require('./fields-sniffer')
const esUtils = require('../utils/es')

const actions = ['create', 'update', 'patch', 'delete']

function cleanLine (line) {
  delete line._needsIndexing
  delete line._needsExtending
  delete line._deleted
  delete line._action
  delete line._error
  delete line._hash
  return line
}

const tmpDir = path.join(config.dataDir, 'tmp')
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

exports.collection = (db, dataset) => {
  return db.collection('dataset-data-' + dataset.id)
}

exports.revisionsCollectionName = (dataset) => 'dataset-revisions-' + dataset.id
exports.revisionsCollection = (db, dataset) => {
  return db.collection(exports.revisionsCollectionName(dataset))
}

exports.initDataset = async (db, dataset) => {
  // just in case of badly cleaned data from previous dataset with same if
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
      await datasetUtils.updateStorage(app, dataset)
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
        fillPrimaryKeyFromId(revision, dataset)
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
      await datasetUtils.updateStorage(app, dataset)
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
    return Buffer.from(JSON.stringify(primaryKey).slice(2, -2)).toString('hex')
  }
}
// make sure that the primary properties are present
// even when they were not given and only _id was given
const fillPrimaryKeyFromId = (line, dataset) => {
  if (!dataset.primaryKey || !dataset.primaryKey.length) return
  const primaryKey = JSON.parse('["' + Buffer.from(line._id, 'hex') + '"]')
  for (let i = 0; i < dataset.primaryKey.length; i++) {
    if (!(dataset.primaryKey[i] in line)) line[dataset.primaryKey[i]] = primaryKey[i]
  }
}

const linesOwnerCols = (req) => {
  const linesOwner = req.linesOwner
  if (!req.linesOwner) return {}
  const cols = { _owner: linesOwner.type + ':' + linesOwner.id }
  if (linesOwner.department) cols._owner += ':' + linesOwner.department
  if (linesOwner.name) {
    cols._ownerName = linesOwner.name
    if (linesOwner.departmentName) cols._ownerName += ` (${linesOwner.department})`
  }
  return cols
}
const linesOwnerFilter = (req) => {
  if (!req.linesOwner) return {}
  const cols = linesOwnerCols(req)
  return { _owner: cols._owner }
}

const applyTransactions = async (req, transacs, validate) => {
  const db = req.app.get('db')
  const dataset = req.dataset
  const datasetCreatedAt = new Date(dataset.createdAt).getTime()
  const updatedAt = new Date()
  const collection = exports.collection(db, dataset)
  const revisionsCollection = exports.revisionsCollection(db, dataset)
  const history = dataset.rest && dataset.rest.history
  const patchProjection = dataset.schema
    .filter(f => !f['x-calculated'])
    .filter(f => !f['x-extension'])
    .reduce((a, p) => { a[p.key] = 1; return a }, {})
  const results = []

  const bulkOp = collection.initializeUnorderedBulkOp()
  let bulkOpResult
  let i = 0
  let hasBulkOp = false
  const bulkOpMatchingResults = []
  const bulkOpMatchingRevisions = []
  for (const transac of transacs) {
    let { _action, ...body } = transac
    if (!actions.includes(_action)) throw createError(400, `action "${_action}" is unknown, use one of ${JSON.stringify(actions)}`)

    Object.assign(body, linesOwnerCols(req))

    if (!body._id) body._id = getLineId(body, dataset)
    if (_action === 'create' && !body._id) body._id = nanoid()
    if (!body._id) throw createError(400, '"_id" attribute is required')

    const extendedBody = { ...body }
    if (dataset.extensions && dataset.extensions.find(e => e.active)) {
      extendedBody._needsExtending = true
    } else {
      extendedBody._needsIndexing = true
    }
    extendedBody._updatedAt = body._updatedAt ? new Date(body._updatedAt) : updatedAt
    extendedBody._i = Number((new Date(extendedBody._updatedAt).getTime() - datasetCreatedAt) + padI(i))
    i++

    const result = { _id: body._id, _action }

    // TODO: add this back based on a setting "rest.storeUpdatedBy" ?
    // if (req.user) extendedBody._updatedBy = { id: req.user.id, name: req.user.name }

    if (_action === 'delete') {
      extendedBody._deleted = true
      extendedBody._hash = null
      bulkOp.find({ _id: body._id, ...linesOwnerFilter(req) }).replaceOne(extendedBody)
      hasBulkOp = true
    } else {
      extendedBody._deleted = false
      if (_action === 'patch') {
        const previousBody = await collection.findOne({ _id: body._id, ...linesOwnerFilter(req) }, { projection: patchProjection })
        if (previousBody) {
          body = { ...previousBody, ...body }
          Object.assign(extendedBody, body)
        }
      }
      if (validate && !validate(body)) {
        await new Promise(resolve => setTimeout(resolve, 0)) // non-blocking in case of large series of errors
        result._error = validate.errors
        result._status = 400
      } else {
        extendedBody._hash = crc32(stableStringify(body)).toString(16)
        const filter = { _id: body._id, _hash: { $ne: extendedBody._hash }, ...linesOwnerFilter(req) }
        bulkOp.find(filter).upsert().replaceOne(extendedBody)
        hasBulkOp = true
      }
    }

    // disable this systematic broadcasting of transactions, not a good idea when doing large bulk inserts
    // and not really used anyway
    // if (!result._error) await req.app.publish('datasets/' + dataset.id + '/transactions', transac)
    const fullResult = { ...result, ...extendedBody }
    results.push(fullResult)
    if (fullResult._status !== 400) {
      bulkOpMatchingResults.push(fullResult)
      if (history) {
        const revision = { ...extendedBody, _action }
        delete revision._needsIndexing
        delete revision._needsExtending
        fillPrimaryKeyFromId(revision, dataset)
        revision._lineId = revision._id
        delete revision._id
        if (!revision._deleted) delete revision._deleted
        bulkOpMatchingRevisions.push(revision)
      }
    }
  }

  if (hasBulkOp) {
    try {
      bulkOpResult = (await bulkOp.execute()).result
    } catch (err) {
      if (!err.writeErrors) throw err
      bulkOpResult = err.result
      for (const writeError of err.writeErrors) {
        const result = bulkOpMatchingResults[writeError.err.index]
        if (history) delete bulkOpMatchingRevisions[writeError.err.index]
        if (writeError.err.code === 11000) {
          // this conflict means that the hash was unchanged
          result._status = 304
        } else {
          result._status = 500
          result._error = writeError.err.errmsg
        }
      }
    }
  }
  if (history) {
    const revisionsBulkOp = revisionsCollection.initializeUnorderedBulkOp()
    let hasRevisionsBulkOp = false
    for (const revision of bulkOpMatchingRevisions) {
      if (!revision) continue
      hasRevisionsBulkOp = true
      revisionsBulkOp.insert(revision)
    }
    if (hasRevisionsBulkOp) {
      await revisionsBulkOp.execute()
    }
  }

  if (req.user && hasBulkOp) {
    db.collection('datasets').updateOne(
      { id: dataset.id },
      { $set: { dataUpdatedAt: updatedAt.toISOString(), dataUpdatedBy: { id: req.user.id, name: req.user.name } } })
  }
  return { results, bulkOpResult }
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
    const { results, bulkOpResult } = await applyTransactions(this.options.req, this.transactions, this.options.validate)
    this.transactions = []
    if (bulkOpResult) {
      this.options.summary.nbCreated += bulkOpResult.nUpserted
      this.options.summary.nbCreated += bulkOpResult.nInserted
    }
    for (const res of results) {
      if (res._error || res._status === 500) {
        this.options.summary.nbErrors += 1
        if (this.options.summary.errors.length < 10) {
          this.options.summary.errors.push({ line: this.i, error: res._error, status: res._status })
        }
      } else {
        this.options.summary.nbOk += 1
        if (res._status === 304) {
          this.options.summary.nbNotModified += 1
        }
        if (res._deleted) {
          this.options.summary.nbDeleted += 1
        }
      }
      this.i += 1
    }
    this.emit('batch')
  }

  async _write (chunk, encoding, cb) {
    try {
      chunk._action = chunk._action || (chunk._id ? 'update' : 'create')
      delete chunk._i
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
  const schema = datasetUtils.jsonSchema(dataset.schema.filter(p => !p['x-calculated'] && !p['x-extension']))
  schema.additionalProperties = false
  schema.properties._id = { type: 'string' }
  // super-admins can set _updatedAt and so rewrite history
  if (adminMode) schema.properties._updatedAt = { type: 'string', format: 'date-time' }
  return ajv.compile(schema, false)
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
  const dir = path.join(datasetUtils.attachmentsDir(req.dataset), lineId)

  if (req.file) {
    // An attachment was uploaded
    await fs.ensureDir(dir)
    await fs.emptyDir(dir)
    await fs.rename(req.file.path, path.join(dir, req.file.originalname))
    const relativePath = path.join(lineId, req.file.originalname)
    const pathField = req.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
    if (!pathField) {
      throw createError(400, 'Le schéma ne prévoit pas d\'associer une pièce jointe')
    }
    req.body[pathField.key] = relativePath
  } else if (!keepExisting) {
    await fs.remove(dir)
  }
}

exports.readLine = async (req, res, next) => {
  const db = req.app.get('db')
  const collection = exports.collection(db, req.dataset)
  const line = await collection.findOne({ _id: req.params.lineId, ...linesOwnerFilter(req) })
  if (!line) return res.status(404).send('Identifiant de ligne inconnu')
  if (line._deleted) return res.status(404).send('Identifiant de ligne inconnu')
  cleanLine(line)
  const updatedAt = (new Date(line._updatedAt)).toUTCString()
  const ifModifiedSince = req.get('If-Modified-Since')
  if (ifModifiedSince && updatedAt === ifModifiedSince) return res.status(304).send()
  res.setHeader('Last-Modified', updatedAt)
  res.send(line)
}

exports.createLine = async (req, res, next) => {
  const db = req.app.get('db')
  const _action = req.body._id ? 'update' : 'create'
  Object.assign(req.body, linesOwnerCols(req))
  req.body._id = req.body._id || getLineId(req.body, req.dataset) || nanoid()
  await manageAttachment(req, false)
  const line = (await applyTransactions(req, [{ _action, ...req.body }], compileSchema(req.dataset, req.user.adminMode))).results[0]
  if (line._error) return res.status(line._status).send(line._error)
  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  res.status(201).send(cleanLine(line))
  datasetUtils.updateStorage(req.app, req.dataset).catch((err) => console.error('failed to update storage after createLine', err))
}

exports.deleteLine = async (req, res, next) => {
  const db = req.app.get('db')
  const line = (await applyTransactions(req, [{ _action: 'delete', _id: req.params.lineId }], compileSchema(req.dataset, req.user.adminMode))).results[0]
  if (line._error) return res.status(line._status).send(line._error)
  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  // TODO: delete the attachment if it is the primary key ?
  res.status(204).send()
  datasetUtils.updateStorage(req.app, req.dataset).catch((err) => console.error('failed to update storage after deleteLine', err))
}

exports.updateLine = async (req, res, next) => {
  const db = req.app.get('db')
  await manageAttachment(req, false)
  const line = (await applyTransactions(req, [{ _action: 'update', _id: req.params.lineId, ...req.body }], compileSchema(req.dataset, req.user.adminMode))).results[0]
  if (line._error) return res.status(line._status).send(line._error)
  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  res.status(200).send(cleanLine(line))
  datasetUtils.updateStorage(req.app, req.dataset).catch((err) => console.error('failed to update storage after updateLine', err))
}

exports.patchLine = async (req, res, next) => {
  const db = req.app.get('db')
  await manageAttachment(req, true)
  const line = (await applyTransactions(req, [{ _action: 'patch', _id: req.params.lineId, ...req.body }], compileSchema(req.dataset, req.user.adminMode))).results[0]
  if (line._error) return res.status(line._status).send(line._error)
  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  res.status(200).send(cleanLine(line))
  datasetUtils.updateStorage(req.app, req.dataset).catch((err) => console.error('failed to update storage after patchLine', err))
}

exports.deleteAllLines = async (req, res, next) => {
  const db = req.app.get('db')
  const esClient = req.app.get('es')
  await exports.initDataset(db, req.dataset)
  const indexName = await esUtils.initDatasetIndex(esClient, req.dataset)
  await esUtils.switchAlias(esClient, req.dataset, indexName)
  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  res.status(204).send()
  datasetUtils.updateStorage(req.app, req.dataset).catch((err) => console.error('failed to update storage after deleteAllLines', err))
}

exports.bulkLines = async (req, res, next) => {
  const db = req.app.get('db')
  const validate = compileSchema(req.dataset, req.user.adminMode)

  // no buffering of this response in the reverse proxy
  res.setHeader('X-Accel-Buffering', 'no')

  // If attachments are sent, add them to the existing ones
  if (req.files && req.files.attachments && req.files.attachments[0]) {
    await attachmentsUtils.addAttachments(req.dataset, req.files.attachments[0])
  }

  // The list of actions/operations/transactions is either in a "actions" file
  // or directly in the body
  let inputStream, parseStreams
  const transactionSchema = [...req.dataset.schema, { key: '_id', type: 'string' }, { key: '_action', type: 'string' }]
  const fileProps = {
    fieldsDelimiter: req.query.sep || ',',
    escape: '"',
    quote: '"',
    newline: '\n'
  }
  if (req.files && req.files.actions && req.files.actions.length) {
    let actionsMime = mime.lookup(req.files.actions[0].originalname)

    if (req.files.actions[0].mimetype === 'application/zip') {
      // handle .zip archive
      const directory = await unzipper.Open.file(req.files.actions[0].path)
      if (directory.files.length !== 1) return res.status(400).send('only accept zip archive with a single file inside')
      actionsMime = mime.lookup(directory.files[0].path)
      inputStream = directory.files[0].stream()
    } else {
      inputStream = fs.createReadStream(req.files.actions[0].path)
      // handle .csv.gz file or other .gz files
      if (req.files.actions[0].originalname.endsWith('.gz')) {
        actionsMime = mime.lookup(req.files.actions[0].originalname.slice(0, -3))
        if (actionsMime) actionsMime += '+gzip'
      }
    }
    parseStreams = datasetUtils.transformFileStreams(actionsMime || 'application/x-ndjson', transactionSchema, null, fileProps, false, true)
  } else {
    inputStream = req
    const contentType = req.get('Content-Type') && req.get('Content-Type').split(';')[0]
    parseStreams = datasetUtils.transformFileStreams(contentType || 'application/json', transactionSchema, null, fileProps, false, true)
  }
  const summary = initSummary()
  const transactionStream = new TransactionStream({ req, validate, summary })

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
      stripBom(),
      stripBom(), // double strip BOM because of badly formatted files from some clients
      ...parseStreams,
      transactionStream
    )
    await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  } catch (err) {
    if (firstBatch) {
      res.writeHeader(err.statusCode || 500, { 'Content-Type': 'application/json' })
    }
    summary.nbErrors += 1
    summary.errors.push({ line: -1, error: err.message })
  }
  res.write(JSON.stringify(summary, null, 2))
  res.end()
  datasetUtils.updateStorage(req.app, req.dataset).catch((err) => console.error('failed to update storage after bulkLines', err))

  for (const key in req.files) {
    if (key === 'attachments') continue
    for (const file of req.files[key]) {
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

  const files = await datasetUtils.lsAttachments(dataset)
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
  await datasetUtils.updateStorage(req.app, req.dataset)

  res.send(summary)
}

exports.readRevisions = async (req, res, next) => {
  if (!req.dataset.rest || !req.dataset.rest.history) {
    return res.status(400).send('L\'historisation des lignes n\'est pas activée pour ce jeu de données.')
  }
  const revisionsCollection = exports.revisionsCollection(req.app.get('db'), req.dataset)
  const filter = req.params.lineId ? { _lineId: req.params.lineId } : {}
  Object.assign(filter, linesOwnerFilter(req))
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
      async transform (chunk, encoding, cb) {
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
        if (this.reading) return
        this.reading = true
        try {
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
      async transform (hit, encoding, callback) {
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
