const fs = require('fs-extra')
const { Writable, Transform } = require('stream')
const csv = require('csv-parser')
const JSONStream = require('JSONStream')
const { stringify: csvStrStream } = require('csv-stringify')
const flatten = require('flat')
const tmp = require('tmp-promise')
const mimeTypeStream = require('mime-type-stream')
const createError = require('http-errors')
const { createGunzip } = require('zlib')
const DecodeStream = require('../../misc/utils/decode-stream')
const metrics = require('../../misc/utils/metrics')
const { csvTypes } = require('../../workers/file-normalizer')
const fieldsSniffer = require('./fields-sniffer')
const restDatasetsUtils = require('./rest')
const { filePath, fullFilePath, tmpDir } = require('./files')
const pump = require('../../misc/utils/pipe')

exports.formatLine = (item, schema) => {
  for (const key of Object.keys(item)) {
    const prop = schema.find(p => p.key === key)
    if (prop && typeof item[key] === 'string') {
      const value = fieldsSniffer.format(item[prop['x-originalName'] || key], prop)
      if (value !== null) item[key] = value
    }
    // special case for rest datasets where null values are kept in a patch
    if (item._action !== 'patch') {
      if (item[key] === null) delete item[key]
    }
  }
}

// used both by exports.readStream and bulk transactions in rest datasets
exports.transformFileStreams = (mimeType, schema, fileSchema, fileProps = {}, raw = false, noExtra = false, encoding, skipDecoding, dataset, autoAdjustKeys = false) => {
  const streams = []

  // file is gzipped
  if (mimeType.endsWith('+gzip')) {
    mimeType = mimeType.replace('+gzip', '')
    streams.push(createGunzip())
    if (!skipDecoding) streams.push(new DecodeStream())
  } else {
    if (!skipDecoding) streams.push(new DecodeStream(encoding))
  }
  if (mimeType === 'application/x-ndjson' || mimeType === 'application/json') {
    streams.push(mimeTypeStream(mimeType).parser())
    // perform some basic normalization on the json
    streams.push(new Transform({
      objectMode: true,
      transform (item, encoding, callback) {
        exports.formatLine(item, schema)
        callback(null, item)
      }
    }))
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
        const hasContent = Object.keys(item).reduce((a, b) => a || ![undefined, '\n', '\r', '\r\n', ''].includes(item[b]), false)
        item._i = this.i = (this.i || 0) + 1
        if (hasContent) callback(null, item)
        else callback()
      }
    }))

    // small local cache for perf
    const escapedKeys = {}
    /** @type {Record<string, string>} */
    const adjustedKeys = {}

    // Fix the objects based on schema
    streams.push(new Transform({
      objectMode: true,
      transform (chunk, encoding, callback) {
        if (raw) {
          if (fileSchema) {
            const unknownKey = Object.keys(chunk)
              .filter(k => k !== '_i')
              .find(k => !fileSchema.find(p => {
                escapedKeys[k] = escapedKeys[k] || fieldsSniffer.escapeKey(k, dataset)
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
        if (autoAdjustKeys) {
          for (const key of Object.keys(chunk)) {
            if (!adjustedKeys[key]) {
              adjustedKeys[key] = fieldsSniffer.escapeKey(key, dataset)
              for (const prop of schema) {
                if (prop.key === adjustedKeys[key] && !prop['x-originalName']) {
                  prop['x-originalName'] = key
                  break
                }
              }
            }
          }
        }
        if (noExtra) {
          const unknownKeys = Object.keys(chunk)
            .filter(k => k !== '_i')
            .filter(k => k !== '')
            .filter(k => !schema.find(p => p['x-originalName'] === k || p.key === k))
          if (unknownKeys.length) {
            return callback(createError(400, `Colonnes inconnues ${unknownKeys.join(', ')}`))
          }
          const readonlyKeys = Object.keys(chunk)
            .filter(k => k !== '_i' && k !== '_id')
            .filter(k => {
              const prop = schema.find(p => p['x-originalName'] === k || p.key === k)
              return prop && (prop['x-calculated'] || prop['x-extension'])
            })
          if (readonlyKeys.length) {
            return callback(createError(400, `Colonnes en lecture seule ${readonlyKeys.join(', ')}`))
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
  const p = full ? fullFilePath(dataset) : filePath(dataset)

  if (!await fs.pathExists(p)) {
    // we should not have to do this
    // this is a weird thing, maybe an unsolved race condition ?
    // let's wait a bit and try again to mask this problem temporarily
    metrics.internalError('indexer-missing-file', 'file missing when indexer started working ' + p)
    await new Promise(resolve => setTimeout(resolve, 10000))
  }

  let streams = [fs.createReadStream(p)]
  if (progress) {
    const { size } = await fs.stat(p)
    streams.push(new Transform({
      transform (chunk, encoding, callback) {
        progress.inc((chunk.length / size) * 100)
        callback(null, chunk)
      }
    }))
  }
  streams = streams.concat(exports.transformFileStreams(dataset.file.mimetype, dataset.schema, dataset.file.schema, full ? {} : dataset.file.props, raw, false, full ? 'UTF-8' : dataset.file.encoding, false, dataset))

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
exports.writeExtendedStreams = async (db, dataset, extensions) => {
  if (dataset.isRest) return restDatasetsUtils.writeExtendedStreams(db, dataset, extensions)
  const tmpFullFile = await tmp.tmpName({ dir: tmpDir })
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
    transforms.push(csvStrStream({ columns: relevantSchema.map(field => field['x-originalName'] || field.key), header: true }))
  } else if (dataset.file.mimetype === 'application/geo+json') {
    transforms.push(new Transform({
      transform (chunk, encoding, callback) {
        const { geometry, ...properties } = chunk
        if (!geometry) return callback()
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
  if (currentLine === 0) throw new Error('[noretry] Échec de l\'échantillonage des données')
  return sampleValues
}
