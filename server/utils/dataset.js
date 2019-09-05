const fs = require('fs-extra')
const path = require('path')
const Combine = require('stream-combiner')
const { Transform } = require('stream')
const iconv = require('iconv-lite')
const config = require('config')
const csv = require('csv-parser')
const JSONStream = require('JSONStream')
const dir = require('node-dir')
const axios = require('axios')
const fieldsSniffer = require('./fields-sniffer')
const geoUtils = require('./geo')
const restDatasetsUtils = require('./rest-datasets')
const vocabulary = require('../../contract/vocabulary')

const baseTypes = new Set(['text/csv', 'application/geo+json'])

exports.fileName = (dataset) => {
  return path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.' + dataset.file.name.split('.').pop())
}

exports.originalFileName = (dataset) => {
  return path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.' + dataset.originalFile.name.split('.').pop())
}

exports.attachmentsDir = (dataset) => {
  return path.join(config.dataDir, dataset.owner.type, dataset.owner.id, dataset.id + '.attachments')
}

exports.lsAttachments = async (dataset) => {
  const dirName = exports.attachmentsDir(dataset)
  if (!await fs.pathExists(dirName)) return []
  const files = (await dir.promiseFiles(dirName))
    .map(f => path.relative(dirName, f))
  return files.filter(p => path.basename(p).toLowerCase() !== 'thumbs.db')
}

exports.lsFiles = async (dataset) => {
  const infos = {}
  if (dataset.file) {
    const filePath = exports.fileName(dataset)
    infos.file = { filePath, size: (await fs.promises.stat(filePath)).size }
  }
  if (dataset.originalFile) {
    const filePath = exports.originalFileName(dataset)
    infos.originalFile = { filePath, size: (await fs.promises.stat(filePath)).size }
  }
  if (dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) {
    const dirPath = exports.attachmentsDir(dataset)
    const paths = await exports.lsAttachments(dataset)
    const files = []
    for (let p of paths) {
      const filePath = path.join(dirPath, p)
      files.push({ filePath, size: (await fs.promises.stat(filePath)).size })
    }
    infos.extractedFiles = { nb: files.length, files }
  }
  return infos
}

// Read the dataset file and get a stream of line items
exports.readStream = (dataset) => {
  if (dataset.isRest) return restDatasetsUtils.readStream(dataset)

  let parser, transformer
  if (dataset.file.mimetype === 'text/csv') {
    // use result from csv-sniffer to configure parser
    parser = csv({
      separator: dataset.file.props.fieldsDelimiter,
      quote: dataset.file.props.escapeChar,
      newline: dataset.file.props.linesDelimiter
    })
    // reject empty lines (parsing failures from csv-parser)
    transformer = new Transform({
      objectMode: true,
      transform(item, encoding, callback) {
        const hasContent = Object.keys(item).reduce((a, b) => a || ![undefined, '\n', '\r', '\r\n'].includes(item[b]), false)
        item._i = this.i = (this.i || 0) + 1
        if (hasContent) callback(null, item)
        else callback()
      }
    })
  } else if (dataset.file.mimetype === 'application/geo+json') {
    parser = JSONStream.parse('features.*')
    // transform geojson features into raw data items
    transformer = new Transform({
      objectMode: true,
      transform(feature, encoding, callback) {
        const item = { ...feature.properties }
        if (feature.id) item.id = feature.id
        item.geometry = feature.geometry
        item._i = this.i = (this.i || 0) + 1
        callback(null, item)
      }
    })
  } else {
    throw new Error('Dataset type is not supported ' + dataset.file.mimetype)
  }
  return Combine(
    fs.createReadStream(exports.fileName(dataset)),
    iconv.decodeStream(dataset.file.encoding),
    parser,
    transformer,
    // Fix the objects based on fields sniffing
    new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
        const line = {}
        dataset.schema.forEach(prop => {
          const value = fieldsSniffer.format(chunk[prop['x-originalName']], prop)
          if (value !== null) line[prop.key] = value
        })
        line._i = chunk._i
        callback(null, line)
      }
    })
  )
}

exports.storageSize = async (db, owner) => {
  let size = 0
  // Sum of the sizes of the files for file-based datasets
  const filter = { 'owner.type': owner.type, 'owner.id': owner.id }
  const aggQuery = [
    { $match: filter },
    { $project: { 'file.size': 1 } },
    { $group: { _id: null, totalSize: { $sum: '$file.size' } } }
  ]
  const res = await db.collection('datasets').aggregate(aggQuery).toArray()
  if (res.length) size += res[0].totalSize

  // Add sum of sizes of collections for REST datasets
  const cursor = db.collection('datasets').find({ ...filter, isRest: true }).project({ id: 1, rest: 1 })
  while (await cursor.hasNext()) {
    const dataset = await cursor.next()
    const collection = await restDatasetsUtils.collection(db, dataset)
    const stats = await collection.stats()
    size += stats.storageSize

    if (dataset.rest && dataset.rest.history) {
      const revisionsCollection = await restDatasetsUtils.revisionsCollection(db, dataset)
      const revisionsStats = await revisionsCollection.stats()
      size += revisionsStats.storageSize
    }
  }

  return size
}

// After a change that might impact consumed storage, we store the value
// and trigger optional webhooks
exports.updateStorageSize = async (db, owner) => {
  const currentSize = await exports.storageSize(db, owner)
  const consumption = { storage: currentSize }
  await db.collection('quotas').updateOne({ type: owner.type, id: owner.id }, { $set: { ...owner, consumption } }, { upsert: true })
  for (let webhook of config.globalWebhooks.consumption) {
    const url = webhook.replace('{type}', owner.type).replace('{id}', owner.id)
    axios.post(url, consumption).catch(err => {
      console.error(`Failure to push consumption webhook ${url} - ${JSON.stringify(consumption)}`, err)
    })
  }
}

exports.storageRemaining = async (db, owner) => {
  const quotas = await db.collection('quotas')
    .findOne({ type: owner.type, id: owner.id })
  const limit = (quotas && quotas.storage !== undefined) ? quotas.storage : config.defaultLimits.totalStorage
  if (limit === -1) return -1
  const size = await exports.storageSize(db, owner)
  return Math.max(0, limit - size)
}

exports.extendedSchema = (dataset) => {
  dataset.schema = dataset.schema || []
  const schema = dataset.schema.filter(f => f.key.startsWith('_ext_') || !f.key.startsWith('_'))

  const fileSchema = dataset.file && dataset.file.schema
  schema.forEach(f => {
    // restore original type and format, in case of removal of a concept
    const fileField = fileSchema && fileSchema.find(ff => ff.key === f.key)
    if (fileField) {
      f.type = fileField.type
      f.format = fileField.format
    }

    // apply type from concepts to the actual field (for example SIRET might be parsed a interger, but should be returned a string)
    if (f['x-refersTo']) {
      const concept = vocabulary.find(c => c.identifiers.includes(f['x-refersTo']))
      // forcing other types than string is more dangerous, for now lets do just that
      if (concept && concept.type === 'string') {
        f.type = concept.type
        if (concept.format) f.format = concept.format
      }
    }
  })

  if (dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) {
    schema.push({ 'x-calculated': true, key: '_file.content', type: 'string', title: `Contenu textuel du fichier`, description: `Résultat d'une extraction automatique` })
    schema.push({ 'x-calculated': true, key: '_file.content_type', type: 'string', title: `Type mime du fichier`, description: `Résultat d'une détection automatique.` })
    schema.push({ 'x-calculated': true, key: '_file.content_length', type: 'integer', title: `La taille en octet du fichier`, description: `Résultat d'une détection automatique.` })
    if (dataset.attachmentsAsImage) {
      schema.push({ 'x-calculated': true, key: '_attachment_url', type: 'string', title: `URL de téléchargement unitaire de l'image jointe`, 'x-refersTo': 'http://schema.org/image' })
    } else {
      schema.push({ 'x-calculated': true, key: '_attachment_url', type: 'string', title: `URL de téléchargement unitaire du fichier joint` })
    }
  }
  if (geoUtils.schemaHasGeopoint(dataset.schema) || geoUtils.schemaHasGeometry(dataset.schema)) {
    schema.push({ 'x-calculated': true, key: '_geoshape', type: 'object', title: `Géométrie`, description: `Au format d'une géométrie GeoJSON` })
    schema.push({ 'x-calculated': true, key: '_geopoint', type: 'string', title: `Coordonnée géographique`, description: `Centroïde au format "lat,lon"` })
    schema.push({ 'x-calculated': true, key: '_geocorners', type: 'array', title: `Boite englobante de la géométrie`, description: `Sous forme d'un tableau de coordonnées au format "lat,lon"` })
  }
  if (dataset.isRest) {
    schema.push({ 'x-calculated': true, key: '_updatedAt', type: 'string', format: 'date-time', title: 'Date de mise à jour', description: 'Date de dernière mise à jour de la ligne du jeu de données' })
    // schema.push({ 'x-calculated': true, key: '_updatedBy', type: 'object', title: 'Utilisateur de mise à jour', description: 'Utilisateur qui a effectué la e dernière mise à jour de la ligne du jeu de données' })
  }
  schema.push({ 'x-calculated': true, key: '_id', type: 'string', format: 'uri-reference', title: 'Identifiant', description: 'Identifiant unique parmi toutes les lignes du jeu de données' })
  schema.push({ 'x-calculated': true, key: '_i', type: 'integer', title: `Numéro de ligne`, description: `Indice de la ligne dans le fichier d'origine` })
  schema.push({ 'x-calculated': true, key: '_rand', type: 'integer', title: `Nombre aléatoire`, description: `Un nombre aléatoire associé à la ligne qui permet d'obtenir un tri aléatoire par exemple` })
  return schema
}

exports.reindex = async (db, dataset) => {
  const patch = { status: 'loaded' }
  if (dataset.isVirtual) patch.status = 'indexed'
  else if (dataset.isRest) patch.status = 'schematized'
  else if (dataset.originalFile && !baseTypes.has(dataset.originalFile.mimetype)) patch.status = 'uploaded'
  await db.collection('datasets').updateOne({ id: dataset.id }, { '$set': patch })
  return (await db.collection('datasets')
    .findOneAndUpdate({ id: dataset.id }, { '$set': patch }, { returnOriginal: false })).value
}

// Generate ids and try insertion until there is no conflict on id
exports.insertWithBaseId = async (db, dataset, baseId) => {
  dataset.id = baseId
  let insertOk = false
  let i = 1
  while (!insertOk) {
    try {
      await db.collection('datasets').insertOne(dataset)
      insertOk = true
    } catch (err) {
      if (err.code !== 11000) throw err
      i += 1
      dataset.id = `${baseId}-${i}`
    }
  }
}
