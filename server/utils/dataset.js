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
const pump = require('util').promisify(require('pump'))
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
const baseTypes = new Set(['text/csv', 'application/geo+json'])
const dataDir = path.resolve(config.dataDir)

exports.dir = (dataset) => {
  const parts = [
    dataDir,
    dataset.owner.type,
    dataset.owner.id,
    dataset.draftReason ? 'datasets-drafts' : 'datasets',
    dataset.id,
  ]
  return path.join(...parts)
}

exports.fileName = (dataset) => {
  return path.join(exports.dir(dataset), dataset.file.name)
}

exports.originalFileName = (dataset) => {
  return path.join(exports.dir(dataset), dataset.originalFile.name)
}

exports.fullFileName = (dataset) => {
  const parsed = path.parse(dataset.file.name)
  return path.join(exports.dir(dataset), `${parsed.name}-full${parsed.ext}`)
}

exports.extFileName = (dataset, ext) => {
  const parsed = path.parse(dataset.originalFile.name)
  return path.join(exports.dir(dataset), `${parsed.name}.${ext}`)
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
    for (const p of paths) {
      const filePath = path.join(dirPath, p)
      files.push({ filePath, size: (await fs.promises.stat(filePath)).size })
    }
    infos.extractedFiles = { nb: files.length, files }
  }
  return infos
}

exports.dataFiles = async (dataset) => {
  if (dataset.isVirtual || dataset.isRest || dataset.isMetaOnly) return []
  const dir = exports.dir(dataset)
  if (!await fs.exists(dir)) {
    throw new Error('Le répertoire de données est absent')
  }
  const files = await fs.readdir(dir)
  const results = []
  if (!dataset.originalFile) return results
  if (!files.includes(dataset.originalFile.name)) {
    console.error('Original data file not found', dir, dataset.originalFile.name)
  } else {
    results.push({
      name: dataset.originalFile.name,
      key: 'original',
      title: 'Fichier original',
      mimetype: dataset.originalFile.mimetype,
    })
  }
  if (!dataset.file) return results
  if (dataset.file.name !== dataset.originalFile.name) {
    if (!files.includes(dataset.file.name)) {
      console.error('Normalized data file not found', dir, dataset.file.name)
    } else {
      results.push({
        name: dataset.file.name,
        key: 'normalized',
        title: `Fichier normalisé (${dataset.file.mimetype.split('/').pop()})`,
        mimetype: dataset.file.mimetype,
      })
    }
  }
  const parsed = path.parse(dataset.file.name)
  if (dataset.extensions && !!dataset.extensions.find(e => e.active)) {
    const name = `${parsed.name}-full${parsed.ext}`
    if (!files.includes(name)) {
      console.error('Full data file not found', path.join(dir, name))
    } else {
      results.push({
        name,
        key: 'full',
        title: `Fichier étendu (${dataset.file.mimetype.split('/').pop()})`,
        mimetype: dataset.file.mimetype,
      })
    }
  }

  if (dataset.bbox) {
    const mbtilesName = `${parsed.name}.mbtiles`
    if (!files.includes(mbtilesName)) {
      console.error('Mbtiles data file not found', path.join(dir, mbtilesName))
    } else {
      results.push({
        name: mbtilesName,
        key: 'mbtiles',
        title: 'Tuiles cartographiques (mbtiles)',
        mimetype: 'application/vnd.sqlite3',
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
exports.transformFileStreams = (mimeType, schema, fileSchema, fileProps = {}, raw = false) => {
  const streams = []

  // file is gzipped
  if (mimeType.endsWith('+gzip')) {
    mimeType = mimeType.replace('+gzip', '')
    streams.push(createGunzip())
  }
  if (mimeType === 'application/x-ndjson' || mimeType === 'application/json') {
    streams.push(mimeTypeStream(mimeType).parser())
  } else if (mimeType === 'text/csv') {
    // use result from csv-sniffer to configure parser
    const parserOpts = {
      separator: fileProps.fieldsDelimiter || ',',
      escape: fileProps.escapeChar || '"',
      quote: fileProps.quote || fileProps.escapeChar || '"',
      newline: fileProps.linesDelimiter || '\n',
    }

    streams.push(csv(parserOpts))
    // reject empty lines (parsing failures from csv-parser)
    streams.push(new Transform({
      objectMode: true,
      transform(item, encoding, callback) {
        const hasContent = Object.keys(item).reduce((a, b) => a || ![undefined, '\n', '\r', '\r\n'].includes(item[b]), false)
        item._i = this.i = (this.i || 0) + 1
        if (hasContent) callback(null, item)
        else callback()
      },
    }))

    // small local cache for perf
    const escapedKeys = {}

    // Fix the objects based on schema
    streams.push(new Transform({
      objectMode: true,
      transform(chunk, encoding, callback) {
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
            fileSchema.forEach(prop => {
              if (chunk[prop['x-originalName']] === undefined) chunk[prop['x-originalName']] = ''
            })
          }
          delete chunk._i
          return callback(null, chunk)
        }
        const line = {}
        schema.forEach(prop => {
          const fileProp = fileSchema && fileSchema.find(p => p.key === prop.key)
          const value = fieldsSniffer.format(chunk[prop['x-originalName'] || prop.key], prop, fileProp)
          if (value !== null) line[prop.key] = value
        })
        line._i = chunk._i
        callback(null, line)
      },
    }))
  } else if (mimeType === 'application/geo+json') {
    streams.push(JSONStream.parse('features.*'))
    // transform geojson features into raw data items
    streams.push(new Transform({
      objectMode: true,
      transform(feature, encoding, callback) {
        const item = { ...feature.properties }
        if (feature.id) item.id = feature.id
        item.geometry = feature.geometry

        const line = { _i: this.i = (this.i || 0) + 1 }
        schema.forEach(prop => {
          const fileProp = fileSchema && fileSchema.find(p => p.key === prop.key)
          const value = fieldsSniffer.format(item[prop['x-originalName']], prop, fileProp)
          if (value !== null) line[prop.key] = value
        })
        callback(null, line)
      },
    }))
  } else {
    throw createError(400, 'mime-type is not supported ' + mimeType)
  }

  return streams
}

// Read the dataset file and get a stream of line items
exports.readStreams = async (db, dataset, raw = false, full = false, ignoreDraftLimit = false, progress) => {
  if (dataset.isRest) return restDatasetsUtils.readStreams(db, dataset)
  const fileName = full ? exports.fullFileName(dataset) : exports.fileName(dataset)

  let streams = [fs.createReadStream(fileName)]
  if (progress) {
    const { size } = await fs.stat(fileName)
    streams.push(new Transform({
      transform(chunk, encoding, callback) {
        progress((chunk.length / size) * 100)
        callback(null, chunk)
      },
    }))
  }
  streams = streams.concat([
    stripBom(),
    iconv.decodeStream(dataset.file.encoding),
    ...exports.transformFileStreams(dataset.file.mimetype, dataset.schema, dataset.file.schema, full ? {} : dataset.file.props, raw),
  ])

  // manage interruption in case of draft mode
  const limit = (dataset.draftReason && !ignoreDraftLimit) ? 100 : -1
  if (limit !== -1) {
    streams.push(new Transform({
      objectMode: true,
      transform(item, encoding, callback) {
        this.i = (this.i || 0) + 1
        if (this.i > limit) return callback()
        callback(null, item)

        // interrupt source stream if we are done
        if (this.i === limit) {
          streams[0].unpipe()
          streams[1].end()
        }
      },
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

    // if we don't use the original name, readStream will not match the keys
    // transforms.push(csvStringify({ columns: relevantSchema.map(field => field.title || field['x-originalName'] || field.key), header: true }))
    transforms.push(new Transform({
      transform(chunk, encoding, callback) {
        const flatChunk = flatten(chunk, { safe: true })
        callback(null, relevantSchema.map(field => flatChunk[field.key]))
      },
      objectMode: true,
    }))
    transforms.push(csvStringify({ columns: relevantSchema.map(field => field['x-originalName'] || field.key), header: true }))
  } else if (dataset.file.mimetype === 'application/geo+json') {
    transforms.push(new Transform({
      transform(chunk, encoding, callback) {
        const { geometry, ...properties } = chunk
        const feature = { type: 'Feature', properties, geometry: JSON.parse(geometry) }
        callback(null, feature)
      },
      objectMode: true,
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
    write(chunk, encoding, callback) {
      if (stopped) return callback()

      let finished = true
      for (const key of Object.keys(chunk)) {
        sampleValues[key] = sampleValues[key] || new Set([])
        // stop if we already have a lot of samples
        if (sampleValues[key].size > 1000) continue
        // ignore empty of too long values to prevent costly sniffing
        if (!chunk[key] || chunk[key].length > 200) continue
        finished = false
        sampleValues[key].add(chunk[key])
      }
      currentLine += 1

      callback()

      if (finished) {
        stopped = true
        streams[0].unpipe()
        streams[1].end()
      }
    },
  }))
  if (currentLine === 0) throw new Error('Èchec de l\'échantillonage des données')
  return sampleValues
}

exports.storage = async (db, dataset) => {
  const storage = {
    size: 0,
  }
  if (!dataset.draftReason && dataset.file && await fs.pathExists(exports.fullFileName(dataset))) {
    const fullSize = (await fs.promises.stat(exports.fullFileName(dataset))).size
    storage.size += fullSize
    storage.fileSize = fullSize
  } else {
    if (dataset.originalFile && dataset.originalFile.size) {
      storage.size += dataset.originalFile.size
      storage.fileSize = dataset.originalFile.size
    } else if (dataset.file && dataset.file.size) {
      storage.size += dataset.file.size
      storage.fileSize = dataset.file.size
    }
  }
  const attachments = await exports.lsAttachments(dataset)
  for (const attachment of attachments) {
    const attachmentSize = (await fs.promises.stat(path.join(exports.attachmentsDir(dataset), attachment))).size
    storage.size += attachmentSize
    storage.attachmentsSize = (storage.attachmentsSize || 0) + attachmentSize
  }
  const metaAttachments = await exports.lsMetadataAttachments(dataset)
  for (const attachment of metaAttachments) {
    const attachmentSize = (await fs.promises.stat(path.join(exports.metadataAttachmentsDir(dataset), attachment))).size
    storage.size += attachmentSize
    storage.attachmentsSize = (storage.attachmentsSize || 0) + attachmentSize
  }
  if (dataset.isRest) {
    const collection = await restDatasetsUtils.collection(db, dataset)
    const stats = await collection.stats()
    // we remove 100 bytes per line that are not really part of the original payload but added by us:
    // _updatedAt, _updatedBy, _needsIndexing, and _i.
    storage.collectionSize = Math.max(0, stats.size - (stats.count * 100))
    storage.size += storage.collectionSize

    if (dataset.rest && dataset.rest.history) {
      const revisionsCollection = await restDatasetsUtils.revisionsCollection(db, dataset)
      const revisionsStats = await revisionsCollection.stats()
      // we remove 60 bytes per line that are not really part of the original payload but added by _updatedAt, _needsIndexing, and _i.
      storage.revisionsSize = Math.max(0, revisionsStats.size - (revisionsStats.count * 60))
      storage.size += storage.revisionsSize
    }
  }
  return storage
}

exports.totalStorage = async (db, owner) => {
  const aggQuery = [
    { $match: { 'owner.type': owner.type, 'owner.id': owner.id } },
    { $project: { 'storage.size': 1 } },
    { $group: { _id: null, totalSize: { $sum: '$storage.size' } } },
  ]
  const res = await db.collection('datasets').aggregate(aggQuery).toArray()
  return (res[0] && res[0].totalSize) || 0
}

// After a change that might impact consumed storage, we store the value
// and trigger optional webhooks
exports.updateStorage = async (db, dataset, deleted = false) => {
  if (!deleted) await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { storage: await exports.storage(db, dataset) } })
  await limits.setConsumption(db, dataset.owner, 'store_bytes', await exports.totalStorage(db, dataset.owner))
}

exports.remainingStorage = async (db, owner) => {
  const limits = await db.collection('limits')
    .findOne({ type: owner.type, id: owner.id })
  const limit = (limits && limits.store_bytes && ![undefined, null].includes(limits.store_bytes.limit)) ? limits.store_bytes.limit : config.defaultLimits.totalStorage
  if (limit === -1) return -1
  const consumption = (limits && limits.store_bytes && limits.store_bytes.consumption) || 0
  return Math.max(0, limit - consumption)
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
      return f
    })
  dataset.schema = dataset.schema.concat(newFields)
}

exports.cleanSchema = (dataset) => {
  const schema = dataset.schema = dataset.schema || []
  const fileSchema = dataset.file && dataset.file.schema
  schema.forEach(f => {
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
  })
  return schema
}

const latlonUri = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'

exports.extendedSchema = (dataset) => {
  exports.cleanSchema(dataset)
  const schema = dataset.schema.filter(f => f.key.startsWith('_ext_') || !f.key.startsWith('_'))
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
    let geoShape = false
    if (geomProp && (!geomProp['x-capabilities'] || geomProp['x-capabilities'].geoShape !== false)) geoShape = true
    schema.push({ 'x-calculated': true, key: '_geoshape', type: 'object', title: 'Géométrie', description: 'Au format d\'une géométrie GeoJSON', 'x-capabilities': { geoShape } })
    const geopoint = { 'x-calculated': true, key: '_geopoint', type: 'string', title: 'Coordonnée géographique', description: 'Centroïde au format "lat,lon"' }
    if (!schema.find(p => p['x-refersTo'] === latlonUri)) geopoint['x-refersTo'] = latlonUri
    schema.push(geopoint)
    schema.push({ 'x-calculated': true, key: '_geocorners', type: 'array', title: 'Boite englobante de la géométrie', description: 'Sous forme d\'un tableau de coordonnées au format "lat,lon"', 'x-capabilities': { geoCorners: !!geomProp } })
  }
  if (dataset.isRest) {
    schema.push({ 'x-calculated': true, key: '_updatedAt', type: 'string', format: 'date-time', title: 'Date de mise à jour', description: 'Date de dernière mise à jour de la ligne du jeu de données' })
    // schema.push({ 'x-calculated': true, key: '_updatedBy', type: 'object', title: 'Utilisateur de mise à jour', description: 'Utilisateur qui a effectué la e dernière mise à jour de la ligne du jeu de données' })
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
  else if (dataset.originalFile && !baseTypes.has(dataset.originalFile.mimetype)) patch.status = 'uploaded'
  return (await db.collection('datasets')
    .findOneAndUpdate({ id: dataset.id }, { $set: patch }, { returnOriginal: false })).value
}

exports.refinalize = async (db, dataset) => {
  const patch = { status: 'indexed' }
  return (await db.collection('datasets')
    .findOneAndUpdate({ id: dataset.id }, { $set: patch }, { returnOriginal: false })).value
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

exports.previews = (dataset) => {
  if (!dataset.schema) return []
  const previews = [{ id: 'table', title: 'Tableau', href: `${config.publicUrl}/embed/dataset/${dataset.id}/table` }]
  if (!!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/startDate') && !!dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/endDate' && !!dataset.schema.find(f => f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label'))) {
    previews.push({ id: 'calendar', title: 'Calendrier', href: `${config.publicUrl}/embed/dataset/${dataset.id}/calendar` })
  }
  if (dataset.bbox) {
    previews.push({ id: 'map', title: 'Carte', href: `${config.publicUrl}/embed/dataset/${dataset.id}/map` })
  }
  const documentProperty = dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
  if (documentProperty && (!documentProperty['x-capabilities'] || documentProperty['x-capabilities'].indexAttachment !== false)) {
    previews.push({ id: 'search-files', title: 'Fichiers', href: `${config.publicUrl}/embed/dataset/${dataset.id}/search-files` })
  }
  if (dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')) {
    previews.push({ id: 'thumbnails', title: 'Vignettes', href: `${config.publicUrl}/embed/dataset/${dataset.id}/thumbnails` })
  }
  return previews
}

exports.delete = async (db, es, dataset) => {
  try {
    await fs.remove(exports.dir({ ...dataset, draftReason: null }))
  } catch (err) {
    console.error('Error while deleting dataset directory', err)
  }
  if (dataset.draft) {
    try {
      await fs.remove(exports.dir({ ...dataset, ...dataset.draft }))
    } catch (err) {
      console.error('Error while deleting dataset draft directory', err)
    }
  }
  if (dataset.isRest) {
    try {
      await restDatasetsUtils.deleteDataset(db, dataset)
    } catch (err) {
      console.error('Error while removing mongodb collection for REST dataset', err)
    }
  }

  await db.collection('datasets').deleteOne({ id: dataset.id })
  await db.collection('journals').deleteOne({ type: 'dataset', id: dataset.id })
  if (!dataset.isVirtual) {
    try {
      await esUtils.delete(es, dataset)
    } catch (err) {
      console.error('Error while deleting dataset indexes and alias', err)
    }
    await exports.updateStorage(db, dataset, true)
  }
}

exports.applyPatch = async (db, dataset, patch) => {
  Object.assign(dataset, patch)

  // if the dataset is in draft mode all patched values are stored in the draft state
  if (dataset.draftReason) {
    const draftPatch = {}
    Object.keys(patch).forEach(key => {
      draftPatch['draft.' + key] = patch[key]
    })
    patch = draftPatch
  }
  await db.collection('datasets')
    .updateOne({ id: dataset.id }, { $set: patch })
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
    }),
  }
}

const cleanProperty = p => {
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
  delete cleanProp.key
  delete cleanProp.ignoreDetection
  delete cleanProp.ignoreIntegerDetection
  delete cleanProp.separator
  delete cleanProp.icon
  return cleanProp
}

exports.jsonSchema = (schema) => {
  return {
    type: 'object',
    properties: schema
      .filter(f => !f['x-calculated'])
      .filter(f => !f['x-extension'])
      .reduce((a, p) => { a[p.key] = cleanProperty(p); return a }, {}),
    }
}
