const fs = require('fs-extra')
const path = require('path')
const { Transform } = require('stream')
const iconv = require('iconv-lite')
const config = require('config')
const csv = require('csv-parser')
const stripBom = require('strip-bom-stream')
const JSONStream = require('JSONStream')
const dir = require('node-dir')
const { Writable } = require('stream')
const csvStringify = require('csv-stringify')
const flatten = require('flat')
const pump = require('../utils/pipe')
const tmp = require('tmp-promise')
const mimeTypeStream = require('mime-type-stream')
const createError = require('http-errors')
const { createGunzip } = require('zlib')
const fieldsSniffer = require('./fields-sniffer')
const geoUtils = require('./geo')
const restDatasetsUtils = require('./rest-datasets')
const vocabulary = require('../../contract/vocabulary')
const limits = require('./limits')
const esUtils = require('./es')
const locks = require('./locks')
const prometheus = require('./prometheus')
const webhooks = require('./webhooks')
const journals = require('./journals')
const { basicTypes, csvTypes } = require('../workers/converter')
const equal = require('deep-equal')
const dataDir = path.resolve(config.dataDir)

exports.dir = (dataset) => {
  const parts = [
    dataDir,
    dataset.owner.type,
    dataset.owner.id,
    dataset.draftReason ? 'datasets-drafts' : 'datasets',
    dataset.id
  ]
  return path.join(...parts)
}

exports.filePath = (dataset) => {
  return path.join(exports.dir(dataset), dataset.file.name)
}

exports.originalFilePath = (dataset) => {
  return path.join(exports.dir(dataset), dataset.originalFile.name)
}

exports.fullFileName = (dataset) => {
  const parsed = path.parse(dataset.file.name)
  return `${parsed.name}-full${parsed.ext}`
}

exports.fullFilePath = (dataset) => {
  return path.join(exports.dir(dataset), exports.fullFileName(dataset))
}

exports.exportedFilePath = (dataset, ext) => {
  return path.join(exports.dir(dataset), `${dataset.id}-last-export${ext}`)
}

exports.attachmentsDir = (dataset) => {
  return path.join(exports.dir(dataset), 'attachments')
}

exports.metadataAttachmentsDir = (dataset) => {
  return path.join(exports.dir(dataset), 'metadata-attachments')
}

exports.lsAttachments = async (dataset) => {
  const dirName = exports.attachmentsDir(dataset)
  if (!await fs.pathExists(dirName)) return []
  const files = (await dir.promiseFiles(dirName))
    .map(f => path.relative(dirName, f))
  return files.filter(p => path.basename(p).toLowerCase() !== 'thumbs.db')
}

exports.lsMetadataAttachments = async (dataset) => {
  const dirName = exports.metadataAttachmentsDir(dataset)
  if (!await fs.pathExists(dirName)) return []
  const files = (await dir.promiseFiles(dirName))
    .map(f => path.relative(dirName, f))
  return files
}

exports.lsFiles = async (dataset) => {
  const infos = {}
  if (dataset.file) {
    const filePath = exports.filePath(dataset)
    infos.file = { filePath, size: (await fs.promises.stat(filePath)).size }
  }
  if (dataset.originalFile) {
    const filePath = exports.originalFilePath(dataset)
    infos.originalFile = { filePath, size: (await fs.promises.stat(filePath)).size }
  }
  if (dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')) {
    const dirPath = exports.attachmentsDir(dataset)
    const paths = await exports.lsAttachments(dataset)
    const files = []
    for (const p of paths) {
      const filePath = path.join(dirPath, p)
      files.push({ filePath, size: (await fs.promises.stat(filePath)).size })
    }
    infos.extractedFiles = { nb: files.length, files }
  }
  return infos
}

exports.dataFiles = async (dataset) => {
  if (dataset.isVirtual || dataset.isMetaOnly) return []
  const dir = exports.dir(dataset)
  if (!await fs.pathExists(dir)) {
    return []
  }
  const files = await fs.readdir(dir)
  const results = []
  if (dataset.originalFile) {
    if (!files.includes(dataset.originalFile.name)) {
      console.warn('Original data file not found', dir, dataset.originalFile.name)
    } else {
      results.push({
        name: dataset.originalFile.name,
        key: 'original',
        title: 'Fichier original',
        mimetype: dataset.originalFile.mimetype
      })
    }
    if (dataset.file) {
      if (dataset.file.name !== dataset.originalFile.name) {
        if (!files.includes(dataset.file.name)) {
          console.warn('Normalized data file not found', dir, dataset.file.name)
        } else {
          results.push({
            name: dataset.file.name,
            key: 'normalized',
            title: `Fichier normalisé (${dataset.file.mimetype.split('/').pop()})`,
            mimetype: dataset.file.mimetype
          })
        }
      }
      const parsed = path.parse(dataset.file.name)
      if (dataset.extensions && !!dataset.extensions.find(e => e.active)) {
        const name = `${parsed.name}-full${parsed.ext}`
        if (!files.includes(name)) {
          console.warn('Full data file not found', path.join(dir, name))
        } else {
          results.push({
            name,
            key: 'full',
            title: `Fichier étendu (${dataset.file.mimetype.split('/').pop()})`,
            mimetype: dataset.file.mimetype
          })
        }
      }
    }
  }
  if (dataset.isRest && dataset?.exports?.restToCSV?.active && dataset?.exports?.restToCSV?.lastExport) {
    const name = `${dataset.id}-last-export.csv`
    if (!files.includes(name)) {
      console.warn('Exported data file not found', path.join(dir, name))
    } else {
      results.push({
        name,
        key: 'export-csv',
        title: 'Fichier exporté (csv)',
        mimetype: 'text/csv'
      })
    }
  }

  for (const result of results) {
    const stats = await fs.stat(path.join(exports.dir(dataset), result.name))
    result.size = stats.size
    result.updatedAt = stats.mtime
    let url = `${config.publicUrl}/api/v1/datasets/${dataset.id}/data-files/${result.name}`
    if (dataset.draftReason) {
      url += '?draft=true'
      result.title += ' - brouillon'
    }
    result.url = url
  }
  return results
}

// used both by exports.readStream and bulk transactions in rest datasets
exports.transformFileStreams = (mimeType, schema, fileSchema, fileProps = {}, raw = false, noExtra = false) => {
  const streams = []

  // file is gzipped
  if (mimeType.endsWith('+gzip')) {
    mimeType = mimeType.replace('+gzip', '')
    streams.push(createGunzip())
  }
  if (mimeType === 'application/x-ndjson' || mimeType === 'application/json') {
    streams.push(mimeTypeStream(mimeType).parser())
  } else if (csvTypes.includes(mimeType)) {
    // use result from csv-sniffer to configure parser
    const parserOpts = {
      separator: fileProps.fieldsDelimiter || ',',
      escape: fileProps.escapeChar || '"',
      quote: fileProps.quote || fileProps.escapeChar || '"',
      newline: fileProps.linesDelimiter || '\n'
    }

    streams.push(csv(parserOpts))
    // reject empty lines (parsing failures from csv-parser)
    streams.push(new Transform({
      objectMode: true,
      transform (item, encoding, callback) {
        const hasContent = Object.keys(item).reduce((a, b) => a || ![undefined, '\n', '\r', '\r\n'].includes(item[b]), false)
        item._i = this.i = (this.i || 0) + 1
        if (hasContent) callback(null, item)
        else callback()
      }
    }))

    // small local cache for perf
    const escapedKeys = {}

    // Fix the objects based on schema
    streams.push(new Transform({
      objectMode: true,
      transform (chunk, encoding, callback) {
        if (raw) {
          if (fileSchema) {
            const unknownKey = Object.keys(chunk)
              .filter(k => k !== '_i')
              .find(k => !fileSchema.find(p => {
                escapedKeys[k] = escapedKeys[k] || fieldsSniffer.escapeKey(k)
                return p.key === escapedKeys[k]
              }))
            if (unknownKey) {
              return callback(new Error(`Échec du traitement de la ligne ${(chunk._i + 1).toLocaleString()} du fichier. Le format est probablement invalide.`))
            }

            // this should not be necessary, but csv-parser does not return all trailing empty values
            for (const prop of fileSchema) {
              if (chunk[prop['x-originalName']] === undefined) chunk[prop['x-originalName']] = ''
            }
          }
          delete chunk._i
          return callback(null, chunk)
        }
        const line = {}
        if (noExtra) {
          const unknownKeys = Object.keys(chunk)
            .filter(k => k !== '_i')
            .filter(k => !schema.find(p => p['x-originalName'] === k || p.key === k))
          if (unknownKeys.length) {
            return callback(createError(400, `Colonnes inconnues ${unknownKeys.join(', ')}`))
          }
        }
        for (const prop of schema) {
          const fileProp = fileSchema && fileSchema.find(p => p.key === prop.key)
          const value = fieldsSniffer.format(chunk[prop['x-originalName'] || prop.key], prop, fileProp)
          if (value !== null) line[prop.key] = value
        }
        line._i = chunk._i
        callback(null, line)
      }
    }))
  } else if (mimeType === 'application/geo+json') {
    streams.push(JSONStream.parse('features.*'))
    // transform geojson features into raw data items
    streams.push(new Transform({
      objectMode: true,
      transform (feature, encoding, callback) {
        const item = flatten({ ...feature.properties }, { safe: true })
        if (feature.id) item.id = feature.id
        item.geometry = feature.geometry

        const line = { _i: this.i = (this.i || 0) + 1 }
        for (const prop of schema) {
          const fileProp = fileSchema && fileSchema.find(p => p.key === prop.key)
          const value = fieldsSniffer.format(item[prop['x-originalName'] || prop.key], prop, fileProp)
          if (value !== null) line[prop.key] = value
        }
        callback(null, line)
      }
    }))
  } else {
    throw createError(400, 'mime-type is not supported ' + mimeType)
  }

  return streams
}

// Read the dataset file and get a stream of line items
exports.readStreams = async (db, dataset, raw = false, full = false, ignoreDraftLimit = false, progress) => {
  if (dataset.isRest) return restDatasetsUtils.readStreams(db, dataset)
  const filePath = full ? exports.fullFilePath(dataset) : exports.filePath(dataset)

  let streams = [fs.createReadStream(filePath)]
  if (progress) {
    const { size } = await fs.stat(filePath)
    streams.push(new Transform({
      transform (chunk, encoding, callback) {
        progress((chunk.length / size) * 100)
        callback(null, chunk)
      }
    }))
  }
  streams.push(stripBom())
  streams.push(stripBom()) // double strip BOM because of badly formatted files from some clients
  if (!full) streams.push(iconv.decodeStream(dataset.file.encoding))
  streams = streams.concat(exports.transformFileStreams(dataset.file.mimetype, dataset.schema, dataset.file.schema, full ? {} : dataset.file.props, raw))

  // manage interruption in case of draft mode
  const limit = (dataset.draftReason && !ignoreDraftLimit) ? 100 : -1
  if (limit !== -1) {
    streams.push(new Transform({
      objectMode: true,
      transform (item, encoding, callback) {
        this.i = (this.i || 0) + 1
        if (this.i > limit) return callback()
        callback(null, item)

        // interrupt source stream if we are done
        if (this.i === limit) {
          streams[0].unpipe()
          streams[1].end()
        }
      }
    }))
  }

  return streams
}

// Used by extender worker to produce the "full" version of the file
exports.writeExtendedStreams = async (db, dataset) => {
  if (dataset.isRest) return restDatasetsUtils.writeExtendedStreams(db, dataset)
  const tmpFullFile = await tmp.tmpName({ dir: path.join(dataDir, 'tmp') })
  // creating empty file before streaming seems to fix some weird bugs with NFS
  await fs.ensureFile(tmpFullFile)

  const writeStream = fs.createWriteStream(tmpFullFile)

  const relevantSchema = dataset.schema.filter(f => !f['x-calculated'])
  const transforms = []

  if (dataset.file.mimetype === 'text/csv') {
    // add BOM for excel, cf https://stackoverflow.com/a/17879474
    writeStream.write('\ufeff')

    transforms.push(new Transform({
      transform (chunk, encoding, callback) {
        const flatChunk = flatten(chunk, { safe: true })
        callback(null, relevantSchema.map(field => flatChunk[field.key]))
      },
      objectMode: true
    }))
    transforms.push(csvStringify({ columns: relevantSchema.map(field => field['x-originalName'] || field.key), header: true }))
  } else if (dataset.file.mimetype === 'application/geo+json') {
    transforms.push(new Transform({
      transform (chunk, encoding, callback) {
        const { geometry, ...properties } = chunk
        const feature = { type: 'Feature', properties, geometry: JSON.parse(geometry) }
        callback(null, feature)
      },
      objectMode: true
    }))
    transforms.push(JSONStream.stringify(`{
  "type": "FeatureCollection",
  "features": [
    `, `,
    `, `
  ]
}`))
  } else {
    throw new Error('Dataset type is not supported ' + dataset.file.mimetype)
  }

  return [...transforms, writeStream]
}

exports.sampleValues = async (dataset) => {
  let currentLine = 0
  let stopped = false
  const sampleValues = {}
  const streams = await exports.readStreams(null, dataset, true, false, true)
  await pump(...streams, new Writable({
    objectMode: true,
    write (chunk, encoding, callback) {
      if (stopped) return callback()

      let finished = true
      for (const key of Object.keys(chunk)) {
        sampleValues[key] = sampleValues[key] || new Set([])
        // stop if we already have a lot of samples
        if (sampleValues[key].size > 1000) continue
        // ignore empty values
        if (!chunk[key]) continue
        finished = false
        // prevent too costly sniffing by truncating long strings
        sampleValues[key].add(chunk[key].length > 300 ? chunk[key].slice(300) : chunk[key])
      }
      currentLine += 1

      callback()

      if (finished) {
        stopped = true
        streams[0].unpipe()
        streams[1].end()
      }
    }
  }))
  if (currentLine === 0) throw new Error('Èchec de l\'échantillonage des données')
  return sampleValues
}

exports.storage = async (db, dataset) => {
  const storage = {
    size: 0,
    dataFiles: await exports.dataFiles(dataset),
    indexed: { size: 0, parts: [] },
    attachments: { size: 0, count: 0 },
    metadataAttachments: { size: 0, count: 0 }
  }
  for (const df of storage.dataFiles) delete df.url

  // storage used by data-files
  const dataFilesObj = storage.dataFiles.reduce((obj, df) => { obj[df.key] = df; return obj }, {})
  for (const dataFile of storage.dataFiles) {
    storage.size += dataFile.size
  }
  if (dataFilesObj.full) {
    storage.indexed = {
      size: dataFilesObj.full.size,
      parts: ['full-file']
    }
  } else if (dataFilesObj.normalized) {
    storage.indexed = {
      size: dataFilesObj.normalized.size,
      parts: ['normalized-file']
    }
  } else if (dataFilesObj.original) {
    storage.indexed = {
      size: dataFilesObj.original.size,
      parts: ['original-file']
    }
  }

  // storage used by mongodb collections
  if (dataset.isRest) {
    const collection = await restDatasetsUtils.collection(db, dataset)
    const stats = await collection.stats()
    storage.collection = { size: stats.size, count: stats.count }
    storage.size += storage.collection.size
    storage.indexed = {
      size: storage.collection.size,
      parts: ['collection']
    }

    if (dataset.rest && dataset.rest.history) {
      const revisionsCollection = await restDatasetsUtils.revisionsCollection(db, dataset)
      const revisionsStats = await revisionsCollection.stats()
      // we remove 60 bytes per line that are not really part of the original payload but added by _action, _updatedAt, _hash and _i.
      storage.revisions = { size: revisionsStats.size, count: revisionsStats.count }
      storage.size += storage.revisions.size
    }
  }

  // storage used by attachments
  const documentProperty = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  if (documentProperty) {
    const attachments = await exports.lsAttachments(dataset)
    for (const attachment of attachments) {
      storage.attachments.size += (await fs.promises.stat(path.join(exports.attachmentsDir(dataset), attachment))).size
      storage.attachments.count++
    }
    storage.size += storage.attachments.size

    if (!documentProperty['x-capabilities'] || documentProperty['x-capabilities'].indexAttachment !== false) {
      storage.indexed.size += storage.attachments.size
      storage.indexed.parts.push('attachments')
    }
  }

  // storage used by metadata attachments
  const metadataAttachments = await exports.lsMetadataAttachments(dataset)
  for (const metadataAttachment of metadataAttachments) {
    storage.metadataAttachments.size += (await fs.promises.stat(path.join(exports.metadataAttachmentsDir(dataset), metadataAttachment))).size
    storage.metadataAttachments.count++
  }
  storage.size += storage.metadataAttachments.size
  return storage
}

// After a change that might impact consumed storage, we store the value
exports.updateStorage = async (db, dataset, deleted = false, checkRemaining = false) => {
  if (dataset.draftReason) {
    console.log(new Error('updateStorage should not be called on a draft dataset'))
    return
  }
  if (!deleted) {
    await db.collection('datasets').updateOne({ id: dataset.id }, {
      $set: {
        storage: await exports.storage(db, dataset)
      }
    })
  }
  return exports.updateTotalStorage(db, dataset.owner, checkRemaining)
}

exports.updateTotalStorage = async (db, owner, checkRemaining = false) => {
  const aggQuery = [
    { $match: { 'owner.type': owner.type, 'owner.id': owner.id } },
    { $project: { 'storage.size': 1, 'storage.indexed.size': 1 } },
    { $group: { _id: null, size: { $sum: '$storage.size' }, indexed: { $sum: '$storage.indexed.size' }, count: { $sum: 1 } } }
  ]
  const res = await db.collection('datasets').aggregate(aggQuery).toArray()
  const totalStorage = { size: (res[0] && res[0].size) || 0, indexed: (res[0] && res[0].indexed) || 0, count: (res[0] && res[0].count) || 0 }

  await limits.setConsumption(db, owner, 'store_bytes', totalStorage.size)
  await limits.setConsumption(db, owner, 'indexed_bytes', totalStorage.indexed)
  await limits.setConsumption(db, owner, 'nb_datasets', totalStorage.count)

  if (checkRemaining && process.env.NO_STORAGE_CHECK !== 'true') {
    const remaining = await limits.remaining(db, owner)
    if (remaining.storage === 0) throw createError(429, 'Vous avez atteint la limite de votre espace de stockage.')
    if (remaining.indexed === 0) throw createError(429, 'Vous avez atteint la limite de votre espace de données indexées.')
    if (remaining.nbDatasets === 0) throw createError(429, 'Vous avez atteint la limite de votre nombre de jeux de données.')
  }
  return totalStorage
}

exports.mergeFileSchema = (dataset) => {
  dataset.schema = dataset.schema || []
  // Remove fields present in the stored schema, when absent from the raw file schema and not coming from extension
  dataset.schema = dataset.schema.filter(field => field['x-extension'] || dataset.file.schema.find(f => f.key === field.key))
  // Add fields not yet present in the stored schema
  const newFields = dataset.file.schema
    .filter(field => !dataset.schema.find(f => f.key === field.key))
    .map(field => {
      const { dateFormat, dateTimeFormat, ...f } = field
      // manage default capabilities
      if (field.type === 'string' && !field.format) f['x-capabilities'] = { textAgg: false }
      if (field.type === 'string' && field['x-display'] === 'textarea') f['x-capabilities'] = { index: false, values: false, textAgg: false, insensitive: false }
      if (field.type === 'string' && field['x-display'] === 'markdown') f['x-capabilities'] = { index: false, values: false, textAgg: false, insensitive: false }
      return f
    })
  dataset.schema = dataset.schema.concat(newFields)
}

exports.cleanSchema = (dataset) => {
  const schema = dataset.schema = dataset.schema || []
  const fileSchema = dataset.file && dataset.file.schema
  for (const f of schema) {
    // restore original type and format, in case of removal of a concept
    // or updated fields in latest file
    const fileField = fileSchema && fileSchema.find(ff => ff.key === f.key)
    if (fileField && (fileField.type !== f.type || fileField.format !== f.format)) {
      f.type = fileField.type
      if (!fileField.format) delete f.format
      else f.format = fileField.format
    }

    // apply type from concepts to the actual field (for example SIRET might be parsed a interger, but should be returned a string)
    if (f['x-refersTo']) {
      const concept = vocabulary.find(c => c.identifiers.includes(f['x-refersTo']))
      // forcing other types than string is more dangerous, for now lets do just that
      if (concept && concept.type === 'string') {
        f.type = concept.type
        if (concept.format) {
          if (concept.format === 'date-time' && f.format === 'date') {
            // special case, concepts with date-time format also accept date format
          } else {
            f.format = concept.format
          }
        }
      }
    }
  }
  return schema
}

const latlonUri = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'

exports.extendedSchema = (dataset) => {
  exports.cleanSchema(dataset)
  const schema = dataset.schema.filter(f => f['x-extension'] || !f.key.startsWith('_'))
  const documentProperty = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  if (documentProperty) {
    if (!documentProperty['x-capabilities'] || documentProperty['x-capabilities'].indexAttachment !== false) {
      schema.push({ 'x-calculated': true, key: '_file.content', type: 'string', title: 'Contenu textuel du fichier', description: 'Résultat d\'une extraction automatique' })
      schema.push({ 'x-calculated': true, key: '_file.content_type', type: 'string', title: 'Type mime du fichier', description: 'Résultat d\'une détection automatique.' })
      schema.push({ 'x-calculated': true, key: '_file.content_length', type: 'integer', title: 'La taille en octet du fichier', description: 'Résultat d\'une détection automatique.' })
    }
    if (dataset.attachmentsAsImage) {
      schema.push({ 'x-calculated': true, key: '_attachment_url', type: 'string', title: 'URL de téléchargement unitaire de l\'image jointe', 'x-refersTo': 'http://schema.org/image' })
    } else {
      schema.push({ 'x-calculated': true, key: '_attachment_url', type: 'string', title: 'URL de téléchargement unitaire du fichier joint' })
    }
  }
  if (geoUtils.schemaHasGeopoint(dataset.schema) || geoUtils.schemaHasGeometry(dataset.schema)) {
    const geomProp = dataset.schema.find(p => p.key === geoUtils.schemaHasGeometry(dataset.schema))
    if (geomProp) {
      schema.push({ 'x-calculated': true, 'x-capabilities': geomProp['x-capabilities'], key: '_geoshape', type: 'object', title: 'Géométrie', description: 'Au format d\'une géométrie GeoJSON' })
    }
    if (geomProp && (!geomProp['x-capabilities'] || geomProp['x-capabilities'].geoCorners !== false)) {
      schema.push({ 'x-calculated': true, key: '_geocorners', type: 'array', title: 'Boite englobante de la géométrie', description: 'Sous forme d\'un tableau de coordonnées au format "lat,lon"' })
    }
    const geopoint = { 'x-calculated': true, key: '_geopoint', type: 'string', title: 'Coordonnée géographique', description: 'Centroïde au format "lat,lon"' }
    if (!schema.find(p => p['x-refersTo'] === latlonUri)) geopoint['x-refersTo'] = latlonUri
    schema.push(geopoint)
  }
  if (dataset.isRest) {
    schema.push({ 'x-calculated': true, key: '_updatedAt', type: 'string', format: 'date-time', title: 'Date de mise à jour', description: 'Date de dernière mise à jour de la ligne du jeu de données' })
    // TODO: add this back based on a setting "rest.storeUpdatedBy" ?
    // schema.push({ 'x-calculated': true, key: '_updatedBy', type: 'object', title: 'Utilisateur de mise à jour', description: 'Utilisateur qui a effectué la e dernière mise à jour de la ligne du jeu de données' })
  }
  if (dataset.isRest && dataset.rest?.lineOwnership) {
    schema.push({
      key: '_owner',
      type: 'string',
      title: 'Propriétaire de la ligne',
      'x-capabilities': { textAgg: false, insensitive: false, text: false, textStandard: false }
    })
    schema.push({
      key: '_ownerName',
      type: 'string',
      title: 'Nom du propriétaire de la ligne',
      'x-capabilities': { textAgg: false, text: false }
    })
  }
  schema.push({ 'x-calculated': true, key: '_id', type: 'string', format: 'uri-reference', title: 'Identifiant', description: 'Identifiant unique parmi toutes les lignes du jeu de données' })
  schema.push({ 'x-calculated': true, key: '_i', type: 'integer', title: 'Numéro de ligne', description: 'Indice de la ligne dans le fichier d\'origine' })
  schema.push({ 'x-calculated': true, key: '_rand', type: 'integer', title: 'Nombre aléatoire', description: 'Un nombre aléatoire associé à la ligne qui permet d\'obtenir un tri aléatoire par exemple' })

  return schema
}

exports.reindex = async (db, dataset) => {
  const patch = { status: 'loaded' }
  if (dataset.isVirtual) patch.status = 'indexed'
  else if (dataset.isRest) patch.status = 'analyzed'
  else if (dataset.originalFile && !basicTypes.includes(dataset.originalFile.mimetype)) patch.status = 'uploaded'
  return (await db.collection('datasets')
    .findOneAndUpdate({ id: dataset.id }, { $set: patch }, { returnDocument: 'after' })).value
}

exports.refinalize = async (db, dataset) => {
  const patch = { status: 'indexed' }
  return (await db.collection('datasets')
    .findOneAndUpdate({ id: dataset.id }, { $set: patch }, { returnDocument: 'after' })).value
}

// Generate ids and try insertion until there is no conflict on id
exports.insertWithBaseId = async (db, dataset, baseId, res) => {
  dataset.id = baseId
  let insertOk = false
  let i = 1
  while (!insertOk) {
    try {
      const lockKey = `dataset:${dataset.id}`
      const ack = await locks.acquire(db, lockKey, 'insertWithBaseid')
      if (ack) {
        res.on('close', () => locks.release(db, lockKey).catch(err => {
          prometheus.internalError.inc({ errorCode: 'dataset-lock' })
          console.error('(dataset-lock) failure to release dataset lock', err)
        }))
        await db.collection('datasets').insertOne(dataset)
        insertOk = true
        break
      }
    } catch (err) {
      if (err.code !== 11000) throw err
    }
    i += 1
    dataset.id = `${baseId}-${i}`
  }
}

exports.previews = (dataset, publicUrl = config.publicUrl) => {
  if (!dataset.schema) return []
  const previews = [{ id: 'table', title: 'Tableau', href: `${publicUrl}/embed/dataset/${dataset.id}/table` }]
  if (!!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate') && !!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate' && !!dataset.schema.find(f => f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label'))) {
    previews.push({ id: 'calendar', title: 'Calendrier', href: `${publicUrl}/embed/dataset/${dataset.id}/calendar` })
  }
  if (dataset.bbox) {
    previews.push({ id: 'map', title: 'Carte', href: `${publicUrl}/embed/dataset/${dataset.id}/map` })
  }
  const documentProperty = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  if (documentProperty && (!documentProperty['x-capabilities'] || documentProperty['x-capabilities'].indexAttachment !== false)) {
    previews.push({ id: 'search-files', title: 'Fichiers', href: `${publicUrl}/embed/dataset/${dataset.id}/search-files` })
  }
  if (dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')) {
    previews.push({ id: 'thumbnails', title: 'Vignettes', href: `${publicUrl}/embed/dataset/${dataset.id}/thumbnails` })
  }
  return previews
}

exports.delete = async (db, es, dataset) => {
  try {
    await fs.remove(exports.dir(dataset))
  } catch (err) {
    console.warn('Error while deleting dataset draft directory', err)
  }
  if (dataset.isRest) {
    try {
      await restDatasetsUtils.deleteDataset(db, dataset)
    } catch (err) {
      console.warn('Error while removing mongodb collection for REST dataset', err)
    }
  }

  await db.collection('datasets').deleteOne({ id: dataset.id })
  await db.collection('journals').deleteOne({ type: 'dataset', id: dataset.id })

  if (!dataset.isVirtual) {
    try {
      await esUtils.delete(es, dataset)
    } catch (err) {
      console.warn('Error while deleting dataset indexes and alias', err)
    }
    if (!dataset.draftReason) {
      await exports.updateStorage(db, dataset, true)
    }
  }
}

exports.applyPatch = async (db, dataset, patch, save = true) => {
  const mongoPatch = {}
  Object.assign(dataset, patch)

  // if the dataset is in draft mode all patched values are stored in the draft state
  if (dataset.draftReason) {
    const draftPatch = {}
    for (const key of Object.keys(patch)) {
      draftPatch['draft.' + key] = patch[key]
    }
    patch = draftPatch
  }
  for (const key of Object.keys(patch)) {
    if (patch[key] === null) {
      mongoPatch.$unset = mongoPatch.$unset || {}
      mongoPatch.$unset[key] = true
    } else {
      mongoPatch.$set = mongoPatch.$set || {}
      mongoPatch.$set[key] = patch[key]
    }
  }
  if (save) {
    await db.collection('datasets')
      .updateOne({ id: dataset.id }, mongoPatch)
  }
  return mongoPatch
}

exports.mergeDraft = (dataset) => {
  if (!dataset.draft) return dataset
  Object.assign(dataset, dataset.draft)
  if (!dataset.draft.finalizedAt) delete dataset.finalizedAt
  if (!dataset.draft.bbox) delete dataset.bbox
  delete dataset.draft
  return dataset
}

exports.tableSchema = (schema) => {
  return {
    fields: schema.filter(f => !f['x-calculated'])
      .filter(f => !f['x-extension'])
      .map(f => {
        const field = { name: f.key, title: f.title || f['x-originalName'], type: f.type }
        if (f.description) field.description = f.description
        // if (f.format) field.format = f.format // commented besause uri-reference format is not in tableschema
        if (f['x-refersTo']) field.rdfType = f['x-refersTo']
        return field
      })
  }
}

const cleanProperty = (p, publicBaseUrl, writableId) => {
  const cleanProp = { ...p }
  // we badly named enum from the start, too bad, now we accept this semantic difference with json schema
  if (cleanProp.enum) {
    cleanProp.examples = cleanProp.enum
    delete cleanProp.enum
  }
  const labels = cleanProp['x-labels']
  if (labels && Object.keys(labels).length) {
    const values = Object.keys(labels).map(key => ({ title: labels[key] || key, const: key }))
    if (cleanProp['x-labelsRestricted']) {
      cleanProp.oneOf = values
    } else {
      cleanProp.anyOf = values
      cleanProp.anyOf.push({})
    }

    delete cleanProp.examples
  }
  if (cleanProp['x-fromUrl'] && publicBaseUrl) {
    cleanProp['x-fromUrl'] = cleanProp['x-fromUrl'].replace(config.publicUrl, publicBaseUrl)
  }
  if (cleanProp.separator) {
    cleanProp['x-separator'] = cleanProp.separator
    delete cleanProp.separator
  }

  if (cleanProp['x-calculated']) cleanProp.readOnly = true
  if (cleanProp['x-extension']) cleanProp.readOnly = true

  if (p['x-refersTo'] === 'http://schema.org/description') cleanProp['x-display'] = 'markdown'

  delete cleanProp.key
  delete cleanProp.ignoreDetection
  delete cleanProp.ignoreIntegerDetection
  delete cleanProp.icon
  delete cleanProp.label
  return cleanProp
}

exports.jsonSchema = (schema, publicBaseUrl) => {
  const properties = {}
  for (const p of schema) {
    properties[p.key] = cleanProperty(p, publicBaseUrl)
  }
  return {
    type: 'object',
    properties
  }
}

// synchronize the list of application references stored in dataset.extras.applications
// used for quick access to capture, and default sorting in dataset pages
exports.syncApplications = async (db, datasetId) => {
  const dataset = await db.collection('datasets').findOne({ id: datasetId }, { projection: { owner: 1, extras: 1 } })
  if (!dataset) return
  const applications = await db.collection('applications')
    .find({
      'owner.type': dataset.owner.type,
      'owner.id': dataset.owner.id,
      'configuration.datasets.href': config.publicUrl + '/api/v1/datasets/' + datasetId
    })
    .project({ id: 1, updatedAt: 1, publicationSites: 1, _id: 0 })
    .toArray()
  const applicationsExtras = ((dataset.extras && dataset.extras.applications) || [])
    .map(appExtra => applications.find(app => app.id === appExtra.id))
    .filter(appExtra => !!appExtra)
  for (const app of applications) {
    if (!applicationsExtras.find(appExtra => appExtra.id === app.id)) {
      applicationsExtras.push(app)
    }
  }
  await db.collection('datasets')
    .updateOne({ id: datasetId }, { $set: { 'extras.applications': applicationsExtras } })
}

exports.schemasFullyCompatible = (schema1, schema2, ignoreCalculated = false) => {
  // a change in these properties does not consitute a breaking change of the api
  // and does not require a re-finalization of the dataset when patched
  const innocuous = {
    title: '',
    description: '',
    'x-display': '',
    'x-master': '',
    'x-labelsRestricted': '',
    'x-labels': '',
    'x-group': '',
    'x-cardinality': '',
    enum: ''
  }
  const schema1Bare = schema1.filter(p => !(p['x-calculated'] && ignoreCalculated)).map(p => ({ ...p, ...innocuous })).sort((p1, p2) => p1.key.localeCompare(p2.key))
  const schema2Bare = schema2.filter(p => !(p['x-calculated'] && ignoreCalculated)).map(p => ({ ...p, ...innocuous })).sort((p1, p2) => p1.key.localeCompare(p2.key))
  return equal(schema1Bare, schema2Bare)
}

exports.validateDraft = async (app, dataset, user, req) => {
  const db = app.get('db')
  const patch = {
    ...dataset.draft
  }
  if (user) {
    patch.updatedAt = (new Date()).toISOString()
    patch.updatedBy = { id: user.id, name: user.name }
  }
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
  const patchedDataset = (await db.collection('datasets').findOneAndUpdate({ id: dataset.id },
    { $set: patch, $unset: { draft: '' } },
    { returnDocument: 'after' }
  )).value
  if (dataset.prod.originalFile) await fs.remove(exports.originalFilePath(dataset.prod))
  if (dataset.prod.file) {
    await fs.remove(exports.filePath(dataset.prod))
    await fs.remove(exports.fullFilePath(dataset.prod))
    webhooks.trigger(db, 'dataset', patchedDataset, { type: 'data-updated' })

    if (req) {
    // WARNING, this functionality is kind of a duplicate of the UI in dataset-schema.vue
      for (const field of dataset.prod.schema) {
        if (field['x-calculated']) continue
        const patchedField = patchedDataset.schema.find(pf => pf.key === field.key)
        if (!patchedField) {
          webhooks.trigger(db, 'dataset', patchedDataset, {
            type: 'breaking-change',
            body: require('i18n').getLocales().reduce((a, locale) => {
              a[locale] = req.__({ phrase: 'breakingChanges.missing', locale }, { title: patchedDataset.title, key: field.key })
              return a
            }, {})
          })
          continue
        }
        if (patchedField.type !== field.type) {
          webhooks.trigger(db, 'dataset', patchedDataset, {
            type: 'breaking-change',
            body: require('i18n').getLocales().reduce((a, locale) => {
              a[locale] = req.__({ phrase: 'breakingChanges.type', locale }, { title: patchedDataset.title, key: field.key })
              return a
            }, {})
          })
          continue
        }
        const format = (field.format && field.format !== 'uri-reference') ? field.format : null
        const patchedFormat = (patchedField.format && patchedField.format !== 'uri-reference') ? patchedField.format : null
        if (patchedFormat !== format) {
          webhooks.trigger(db, 'dataset', patchedDataset, {
            type: 'breaking-change',
            body: require('i18n').getLocales().reduce((a, locale) => {
              a[locale] = req.__({ phrase: 'breakingChanges.type', locale }, { title: patchedDataset.title, key: field.key })
              return a
            }, {})
          })
          continue
        }
      }
    }
  }
  await fs.ensureDir(exports.dir(patchedDataset))
  await fs.remove(exports.originalFilePath(patchedDataset))
  await fs.move(exports.originalFilePath(dataset), exports.originalFilePath(patchedDataset))
  if (await fs.pathExists(exports.attachmentsDir(dataset))) {
    await fs.remove(exports.attachmentsDir(patchedDataset))
    await fs.move(exports.attachmentsDir(dataset), exports.attachmentsDir(patchedDataset))
  }

  const statusPatch = { status: basicTypes.includes(dataset.originalFile.mimetype) ? 'analyzed' : 'uploaded' }
  const statusPatchedDataset = (await db.collection('datasets').findOneAndUpdate({ id: dataset.id },
    { $set: statusPatch },
    { returnDocument: 'after' }
  )).value
  await journals.log(app, statusPatchedDataset, { type: 'draft-validated' }, 'dataset')
  try {
    await esUtils.delete(app.get('es'), dataset)
  } catch (err) {
    if (err.statusCode !== 404) throw err
  }
  await fs.remove(exports.dir(dataset))
  await exports.updateStorage(db, statusPatchedDataset)
  return statusPatchedDataset
}

exports.validateCompatibleDraft = async (app, dataset) => {
  if (dataset.draftReason && dataset.draftReason.key === 'file-updated') {
    const prodDataset = await app.get('db').collection('datasets').findOne({ id: dataset.id })
    const fullDataset = { ...dataset, prod: prodDataset, draft: dataset }
    if (!dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument') && exports.schemasFullyCompatible(fullDataset.prod.schema, dataset.schema, true)) {
      return await exports.validateDraft(app, fullDataset)
    }
  }
  return null
}
