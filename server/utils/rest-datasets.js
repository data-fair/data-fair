const config = require('config')
const fs = require('fs-extra')
const path = require('path')
const createError = require('http-errors')
const shortid = require('shortid')
const util = require('util')
const pump = util.promisify(require('pump'))
const ajv = require('ajv')()
const Combine = require('stream-combiner')
const multer = require('multer')
const mime = require('mime-types')
const JSONStream = require('JSONStream')
const { Transform, Writable } = require('stream')
const mimeTypeStream = require('mime-type-stream')
const datasetUtils = require('./dataset')
const attachmentsUtils = require('./attachments')
const fieldsSniffer = require('./fields-sniffer')

const actions = ['create', 'update', 'patch', 'delete']

function cleanLine(line) {
  delete line._needsIndexing
  delete line._deleted
  delete line._action
  delete line._error
  return line
}

const destination = async (req, file, cb) => {
  try {
    const tmpDir = path.join(config.dataDir, 'tmp')
    await fs.ensureDir(tmpDir)
    cb(null, tmpDir)
  } catch (err) {
    cb(err)
  }
}

exports.uploadAttachment = multer({
  storage: multer.diskStorage({ destination })
}).single('attachment')

exports.uploadBulk = multer({
  storage: multer.diskStorage({ destination })
}).fields([{ name: 'attachments', maxCount: 1 }, { name: 'actions', maxCount: 1 }])

exports.collection = (db, dataset) => {
  return db.collection('dataset-data-' + dataset.id)
}

exports.initDataset = async (db, dataset) => {
  const collection = exports.collection(db, dataset)
  await collection.createIndex({ _updatedAt: 1 })
  await collection.createIndex({ _deleted: 1 })
}

exports.deleteDataset = async (db, dataset) => {
  const collection = exports.collection(db, dataset)
  await collection.drop()
}

const applyTransaction = async (collection, user, transac, validate) => {
  let { _action, ...body } = transac
  _action = _action || 'create'
  if (!actions.includes(_action)) throw createError(400, `action "${_action}" is unknown, use one of ${JSON.stringify(actions)}`)
  if (_action === 'create' && !body._id) body._id = shortid.generate()
  if (!body._id) throw createError(400, `"_id" attribute is required`)

  const extendedBody = { ...body }
  extendedBody._needsIndexing = true
  extendedBody._updatedAt = new Date()
  extendedBody._updatedBy = { id: user.id, name: user.name }
  extendedBody._deleted = false
  let doc
  if (_action === 'create' || _action === 'update') {
    if (!validate(body)) doc = { _error: validate.errors }
    else doc = (await collection.findOneAndReplace({ _id: body._id }, extendedBody, { upsert: true, returnOriginal: false })).value
  } else if (_action === 'patch') {
    if (!validate(body)) doc = { _error: validate.errors }
    else doc = (await collection.findOneAndUpdate({ _id: body._id }, { $set: extendedBody }, { upsert: true, returnOriginal: false })).value
  } else if (_action === 'delete') {
    extendedBody._deleted = true
    doc = (await collection.findOneAndReplace({ _id: body._id }, extendedBody, { returnOriginal: false })).value
  }
  return { _id: body._id, _action, _status: doc._error ? 400 : 200, ...doc }
}

const compileSchema = (dataset) => {
  return ajv.compile({
    type: 'object',
    additionalProperties: false,
    properties: dataset.schema
      .filter(f => f.key[0] !== '_')
      .concat([{ key: '_id', type: 'string' }])
      .reduce((a, b) => { a[b.key] = b; return a }, {})
  })
}

async function manageAttachment(req, keepExisting) {
  if (req.is('multipart/form-data')) {
    // When taken from form-data everything is string.. convert to actual types
    req.dataset.schema
      .filter(f => !f['x-calculated'])
      .forEach(f => {
        if (req.body[f.key] !== undefined) req.body[f.key] = fieldsSniffer.format(req.body[f.key], f)
      })
  }
  const lineId = req.params.lineId || req.body._id
  const dir = path.join(datasetUtils.attachmentsDir(req.dataset), lineId)

  if (req.file) {
    // An attachment was uploaded
    await fs.ensureDir(dir)
    await fs.emptyDir(dir)
    await fs.rename(req.file.path, path.join(dir, req.file.originalname))
    const relativePath = path.join(lineId, req.file.originalname)
    let pathField = req.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
    if (!pathField) {
      throw createError(400, `Le schéma ne prévoit pas d'associer une pièce jointe`)
    }
    req.body[pathField.key] = relativePath
  } else if (!keepExisting) {
    await fs.remove(dir)
  }
}

exports.readLine = async (req, res, next) => {
  const db = req.app.get('db')
  const collection = exports.collection(db, req.dataset)
  const line = await collection.findOne({ _id: req.params.lineId })
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
  req.body._id = req.body._id || shortid.generate()
  await manageAttachment(req, false)
  const collection = exports.collection(db, req.dataset)
  const line = await applyTransaction(collection, req.user, { _action: 'create', ...req.body }, compileSchema(req.dataset))
  if (line._error) return res.status(400).send(line._error)
  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  res.status(201).send(cleanLine(line))
}

exports.deleteLine = async (req, res, next) => {
  const db = req.app.get('db')
  const collection = exports.collection(db, req.dataset)
  await manageAttachment(req, false)
  const line = await applyTransaction(collection, req.user, { _action: 'delete', _id: req.params.lineId }, compileSchema(req.dataset))
  if (line._error) return res.status(400).send(line._error)
  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  await datasetUtils.updateStorageSize(db, req.dataset.owner)
  res.status(204).send()
}

exports.updateLine = async (req, res, next) => {
  const db = req.app.get('db')
  const collection = exports.collection(db, req.dataset)
  await manageAttachment(req, false)
  const line = await applyTransaction(collection, req.user, { _action: 'update', _id: req.params.lineId, ...req.body }, compileSchema(req.dataset))
  if (line._error) return res.status(400).send(line._error)
  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  await datasetUtils.updateStorageSize(db, req.dataset.owner)
  res.status(200).send(cleanLine(line))
}

exports.patchLine = async (req, res, next) => {
  const db = req.app.get('db')
  const collection = exports.collection(db, req.dataset)
  await manageAttachment(req, true)
  const line = await applyTransaction(collection, req.user, { _action: 'patch', _id: req.params.lineId, ...req.body }, compileSchema(req.dataset))
  if (line._error) return res.status(400).send(line._error)
  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  await datasetUtils.updateStorageSize(db, req.dataset.owner)
  res.status(200).send(cleanLine(line))
}

exports.bulkLines = async (req, res, next) => {
  const db = req.app.get('db')
  const collection = exports.collection(db, req.dataset)
  const validate = compileSchema(req.dataset)

  // If attachments are sent, add them to the existing ones
  if (req.files && req.files.attachments && req.files.attachments[0]) {
    await attachmentsUtils.addAttachments(req.dataset, req.files.attachments[0])
  }

  // The list of actions/operations/transactions is either in a "actions" file
  // or directly in the body
  let inputStream, parseStream
  if (req.files && req.files.actions && req.files.actions.length) {
    inputStream = fs.createReadStream(req.files.actions[0].path)
    const mimetype = mime.lookup(req.files.actions[0].originalname)
    parseStream = mimeTypeStream(mimetype).parser()
  } else {
    inputStream = req
    const ioStream = mimeTypeStream(req.get('Content-Type')) || mimeTypeStream('application/json')
    parseStream = ioStream.parser()
  }
  const transactionStream = new Transform({
    objectMode: true,
    async transform(chunk, encoding, cb) {
      applyTransaction(collection, req.user, chunk, validate)
        .then(line => {
          cb(null, line)
        }, error => {
          if (error.status === 400) cb(null, { error })
          else cb(error)
        })
    }
  })

  await pump(
    inputStream,
    parseStream,
    transactionStream,
    JSONStream.stringify(),
    res
  )
  await db.collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  await datasetUtils.updateStorageSize(db, req.dataset.owner)
}

exports.readStream = (db, dataset, onlyUpdated) => {
  const collection = exports.collection(db, dataset)
  const filter = {}
  if (onlyUpdated) filter._needsIndexing = true
  return Combine(collection.find(filter).stream(), new Transform({
    objectMode: true,
    async transform(chunk, encoding, cb) {
      chunk._i = chunk._updatedAt.getTime()
      cb(null, chunk)
    }
  }))
}

exports.markIndexedStream = (db, dataset) => {
  const collection = exports.collection(db, dataset)
  return new Writable({
    objectMode: true,
    async write(chunk, encoding, cb) {
      try {
        const line = await collection.findOne({ _id: chunk._id })
        // if the line was updated in the interval since reading for indexing
        // do not mark it as properly indexed
        if (chunk._updatedAt.getTime() === line._updatedAt.getTime()) {
          if (chunk._deleted) {
            await collection.deleteOne({ _id: chunk._id })
          } else {
            await collection.updateOne({ _id: chunk._id }, { $set: { _needsIndexing: false } })
          }
        }
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
