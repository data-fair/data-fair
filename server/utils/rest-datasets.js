const createError = require('http-errors')
const shortid = require('shortid')
const util = require('util')
const pump = util.promisify(require('pump'))
const Combine = require('stream-combiner')
const { Transform, Writable } = require('stream')
const mimeTypeStream = require('mime-type-stream')
const actions = ['create', 'update', 'patch', 'delete']

function cleanLine(line) {
  line.id = line._id
  delete line._id
  delete line._needsIndexing
  return line
}

exports.initDataset = async (db, dataset) => {
  const collection = db.collection('dataset-data-' + dataset.id)
  await collection.createIndex({ _updatedAt: 1 })
  await collection.createIndex({ _deleted: 1 })
}

exports.prepareSchema = (schema) => {
  if (!schema.find(f => f.key === 'id')) {
    schema.push({
      key: 'id',
      type: 'string',
      format: 'uri-reference',
      title: 'Identifiant',
      description: 'Identifiant unique parmi toutes les lignes du jeu de données'
    })
  }
  if (!schema.find(f => f.key === '_updatedAt')) {
    schema.push({
      key: '_updatedAt',
      type: 'string',
      format: 'date-time',
      title: 'Date de mise à jour',
      description: 'Date de dernière mise à jour de la ligne du jeu de données'
    })
  }
  if (!schema.find(f => f.key === '_updatedBy')) {
    schema.push({
      key: '_updatedBy',
      type: 'object',
      title: 'Utilisateur de mise à jour',
      description: 'Utilisateur qui a effectué la e dernière mise à jour de la ligne du jeu de données'
    })
  }
}

const applyTransaction = async (collection, user, transac) => {
  let { _action, ...body } = transac
  _action = _action || 'create'
  if (!actions.includes(_action)) throw createError(400, `action "${_action}" is unknown, use one of ${JSON.stringify(actions)}`)
  body._id = body._id || body.id
  delete body.id
  if (_action === 'create' && !body._id) body._id = shortid.generate()
  if (!body._id) throw createError(400, `"id" attribute is required`)

  body._needsIndexing = true
  body._updatedAt = new Date()
  body._updatedBy = { id: user.id, name: user.name }
  body._deleted = false
  if (_action === 'create' || _action === 'update') {
    return (await collection.findOneAndReplace({ _id: body._id }, body, { upsert: true, returnOriginal: false })).value
  } else if (_action === 'patch') {
    return (await collection.findOneAndUpdate({ _id: body._id }, { $set: body }, { upsert: true, returnOriginal: false })).value
  } else if (_action === 'delete') {
    body._deleted = true
    return (await collection.findOneAndReplace({ _id: body._id }, body, { returnOriginal: false })).value
  }
}

exports.readLine = async (req, res, next) => {
  const collection = req.app.get('db').collection('dataset-data-' + req.dataset.id)
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
  const collection = req.app.get('db').collection('dataset-data-' + req.dataset.id)
  const line = await applyTransaction(collection, req.user, { _action: 'create', ...req.body })
  await req.app.get('db').collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  res.status(201).send(cleanLine(line))
}

exports.deleteLine = async (req, res, next) => {
  const collection = req.app.get('db').collection('dataset-data-' + req.dataset.id)
  await applyTransaction(collection, req.user, { _action: 'delete', id: req.params.lineId })
  await req.app.get('db').collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  res.status(204).send()
}

exports.updateLine = async (req, res, next) => {
  const collection = req.app.get('db').collection('dataset-data-' + req.dataset.id)
  const line = await applyTransaction(collection, req.user, { _action: 'update', id: req.params.lineId, ...req.body })
  await req.app.get('db').collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  res.status(200).send(cleanLine(line))
}

exports.patchLine = async (req, res, next) => {
  const collection = req.app.get('db').collection('dataset-data-' + req.dataset.id)
  const line = await applyTransaction(collection, req.user, { _action: 'patch', id: req.params.lineId, ...req.body })
  await req.app.get('db').collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
  res.status(200).send(cleanLine(line))
}

exports.bulkLines = async (req, res, next) => {
  const collection = req.app.get('db').collection('dataset-data-' + req.dataset.id)
  const ioStream = mimeTypeStream(req.get('Content-Type')) || mimeTypeStream('application/json')
  const transactionStream = new Transform({
    objectMode: true,
    async transform(chunk, encoding, cb) {
      applyTransaction(collection, req.user, chunk)
        .then(line => cb(null, cleanLine(line)), err => cb(err))
    }
  })

  await pump(
    req,
    ioStream.parser(),
    transactionStream,
    ioStream.serializer(),
    res
  )
  await req.app.get('db').collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'updated' } })
}

exports.readStream = (db, dataset, onlyUpdated) => {
  const collection = db.collection('dataset-data-' + dataset.id)
  const filter = {}
  if (onlyUpdated) filter._needsIndexing = true
  return Combine(collection.find(filter).stream(), new Transform({
    objectMode: true,
    async transform(chunk, encoding, cb) {
      chunk._i = chunk._updatedAt.getTime()
      console.log('read line', chunk)
      cb(null, chunk)
    }
  }))
}

exports.markIndexedStream = (db, dataset) => {
  const collection = db.collection('dataset-data-' + dataset.id)
  return new Writable({
    objectMode: true,
    async write(chunk, encoding, cb) {
      try {
        const line = await collection.findOne({ _id: chunk._id })
        // if the line was updated in the interval since reading for indexing
        // do not mark it as properly indexed
        if (chunk._updatedAt.getTime() === line._updatedAt.getTime()) {
          if (chunk._deleted) {
            console.log('validate deletion after indexing', chunk._id)
            await collection.deleteOne({ _id: chunk._id })
          } else {
            console.log('validate after indexing', chunk._id)
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
  const collection = db.collection('dataset-data-' + dataset.id)
  if (filter) return collection.countDocuments(filter)
  else return collection.estimatedDocumentCount()
}
