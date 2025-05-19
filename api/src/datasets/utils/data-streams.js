import fs from 'fs-extra'
import { flatten } from 'flat'
import { Writable, Transform } from 'stream'
import csv from 'csv-parser'
import JSONStream from 'JSONStream'
import { stringify as csvStrStream } from 'csv-stringify'
import tmp from 'tmp-promise'
import mimeTypeStream from 'mime-type-stream'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { createGunzip } from 'zlib'
import DecodeStream from '../../misc/utils/decode-stream.js'
import { csvTypes } from './types.js'
import * as fieldsSniffer from './fields-sniffer.js'
import * as restDatasetsUtils from './rest.js'
import { filePath, fullFilePath, tmpDir } from './files.ts'
import pump from '../../misc/utils/pipe.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import { compileExpression } from './extensions.js'
import { getFlattenNoCache } from './flatten.ts'

export const formatLine = (item, schema) => {
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

// used both by readStream and bulk transactions in rest datasets
export const transformFileStreams = (mimeType, schema, fileSchema, fileProps = {}, raw = false, noExtra = false, encoding, skipDecoding, dataset, autoAdjustKeys = false, applyTransform = false) => {
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
        formatLine(item, schema)
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
        this.i = (this.i || 0) + 1
        item._i = this.i
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
              .filter(k => !!chunk[k]?.trim())
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
          const keys = Object.keys(chunk)
          const unknownKeys = keys
            .filter(k => k !== '_i' && k !== '' && !schema.some(p => p['x-originalName'] === k || p.key === k))
          if (unknownKeys.length) {
            return callback(httpError(400, `Colonnes inconnues ${unknownKeys.join(', ')}`))
          }
          const removeKeys = keys
            .filter(k => {
              if (k === '_i' || k === '_id') return false
              const prop = schema.find(p => p['x-originalName'] === k || p.key === k)
              return prop && (prop['x-calculated'] || prop['x-extension'])
            })
          if (removeKeys.length) {
            this.__warning = `Colonnes issues d'extensions dont le contenu sera écrasé : ${removeKeys.join(', ')}`
          }
        }
        for (const prop of schema) {
          if (noExtra && (prop['x-calculated'] || prop['x-extension'])) continue
          const fileProp = fileSchema && fileSchema.find(p => p.key === prop.key)
          let originalName = prop['x-originalName']
          if (fileSchema && !prop['x-calculated'] && !prop['x-extension']) originalName = fileProp?.['x-originalName']
          line[prop.key] = chunk[originalName || prop.key] ?? chunk[prop.key]
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
        const item = flatten({ ...feature.properties })
        if (feature.id) item.id = feature.id
        item.geometry = feature.geometry
        if (raw) {
          callback(null, item)
        } else {
          const line = {}
          for (const prop of schema) {
            const fileProp = fileSchema && fileSchema.find(p => p.key === prop.key)
            let originalName = prop['x-originalName']
            if (fileSchema && !prop['x-calculated'] && !prop['x-extension']) originalName = fileProp?.['x-originalName']
            line[prop.key] = item[originalName || prop.key] ?? item[prop.key]
          }
          this.i = (this.i || 0) + 1
          line._i = this.i
          callback(null, line)
        }
      }
    }))
  } else {
    throw httpError(400, 'mime-type is not supported ' + mimeType)
  }

  if (!raw) {
    const transformExprStream = getTransformStream(schema, fileSchema, applyTransform)
    if (transformExprStream) {
      streams.push(transformExprStream)
    }
  }

  return streams
}

export const getTransformStream = (schema, fileSchema, applyTransform = false) => {
  const compiledExpressions = {}
  return new Transform({
    objectMode: true,
    transform (item, encoding, callback) {
      for (const prop of schema) {
        if (applyTransform && prop['x-transform']?.expr) {
          if ([null, undefined, ''].includes(item[prop.key])) {
            delete item[prop.key]
          } else {
            compiledExpressions[prop.key] = compiledExpressions[prop.key] || compileExpression(prop['x-transform']?.expr, prop)
            try {
              const value = typeof item[prop.key] === 'string' ? item[prop.key].trim() : item[prop.key]
              item[prop.key] = compiledExpressions[prop.key]({ value })
            } catch (err) {
              const message = `[noretry] échec de l'évaluation de l'expression "${prop['x-transform']?.expr}" : ${err.message}`
              throw new Error(message)
            }
          }
        } else {
          const fileProp = fileSchema && fileSchema.find(p => p.key === prop.key)
          const value = fieldsSniffer.format(item[prop.key], prop, fileProp)
          if (value === null) {
            delete item[prop.key]
          } else {
            item[prop.key] = value
          }
        }
      }
      callback(null, item)
    }
  })
}

// Read the dataset file and get a stream of line items
export const readStreams = async (db, dataset, raw = false, full = false, ignoreDraftLimit = false, progress) => {
  if (dataset.isRest) return restDatasetsUtils.readStreams(db, dataset)
  const p = full ? fullFilePath(dataset) : filePath(dataset)

  if (!await fs.pathExists(p)) {
    // we should not have to do this
    // this is a weird thing, maybe an unsolved race condition ?
    // let's wait a bit and try again to mask this problem temporarily
    internalError('indexer-missing-file', 'file missing when indexer started working ' + p)
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
  streams = streams.concat(transformFileStreams(dataset.file.mimetype, dataset.schema, dataset.file.schema, full ? {} : dataset.file.props, raw, false, full ? 'UTF-8' : dataset.file.encoding, false, dataset, false, !full))

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
export const writeExtendedStreams = async (db, dataset, extensions) => {
  if (dataset.isRest) return restDatasetsUtils.writeExtendedStreams(db, dataset, extensions)
  const flatten = getFlattenNoCache(dataset)
  const tmpFullFile = await tmp.tmpName({ tmpdir: tmpDir, prefix: 'full-' })
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
        const flatChunk = flatten(chunk)
        callback(null, relevantSchema.map(field => flatChunk[field.key]))
      },
      objectMode: true
    }))
    transforms.push(csvStrStream({
      columns: relevantSchema.map(field => field['x-originalName'] || field.key),
      header: true,
      cast: {
        boolean: (v) => {
          if (v === true) return '1'
          if (v === false) return '0'
          return ''
        }
      }
    }))
  } else if (dataset.file.mimetype === 'application/geo+json') {
    transforms.push(new Transform({
      transform (chunk, encoding, callback) {
        const { geometry } = chunk
        if (!geometry) return callback()
        const properties = {}
        for (const field of relevantSchema) {
          if (field.key in chunk) {
            properties[field['x-originalName'] || field.key] = chunk[field.key]
          }
        }
        for (const ext of extensions) {
          if (ext.propertyPrefix in chunk) {
            properties[ext.propertyPrefix] = chunk[ext.propertyPrefix]
          }
        }
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

export const sampleValues = async (dataset, ignoreKeys, onDecodedData) => {
  let currentLine = 0
  let stopped = false
  const sampleValues = {}
  const streams = await readStreams(null, dataset, true, false, true)
  if (onDecodedData) {
    const decodeStreamIndex = streams.findIndex(s => s instanceof DecodeStream)
    if (decodeStreamIndex !== -1) {
      streams.splice(decodeStreamIndex + 1, 0,
        new Transform({
          transform (chunk, encoding, callback) {
            onDecodedData(chunk)
            callback(null, chunk)
          }
        })
      )
    }
  }
  await pump(...streams, new Writable({
    objectMode: true,
    write (chunk, encoding, callback) {
      if (stopped) return callback()

      let finished = true
      for (const key of Object.keys(chunk)) {
        if (ignoreKeys && ignoreKeys.includes(key)) continue
        sampleValues[key] = sampleValues[key] || new Set([])
        // stop if we already have a lot of samples
        if (sampleValues[key].size >= 1000) continue
        // ignore empty values
        if (chunk[key] === null || chunk[key] === undefined || chunk[key] === '') continue
        finished = false
        const value = typeof chunk[key] !== 'string' ? '' + chunk[key] : chunk[key]
        // prevent too costly sniffing by truncating long strings
        sampleValues[key].add(value.length > 300 ? value.slice(300) : value)
      }
      currentLine += 1

      callback()

      if (finished) {
        stopped = true
        if (!onDecodedData) {
          streams[0].unpipe()
          streams[1].end()
        }
      }
    }
  }))
  if (currentLine === 0) throw new Error('[noretry] Échec de l\'échantillonage des données')
  return sampleValues
}
