import { Transform } from 'stream'
import path from 'path'
import { Piscina } from 'piscina'
import mongo from '#mongo'
import { getCsvSerializer } from './csv-jit.ts'

export const results2sheetPiscina = new Piscina({
  filename: path.resolve(import.meta.dirname, '../../datasets/threads/results2sheet.js'),
  minThreads: 0,
  idleTimeout: 60 * 60 * 1000,
  maxThreads: 1
})

export const geojson2shpPiscina = new Piscina({
  filename: path.resolve(import.meta.dirname, '../../datasets/threads/geojson2shp.ts'),
  minThreads: 0,
  idleTimeout: 60 * 60 * 1000,
  maxThreads: 1
})

// Resolve the columns to emit + the JIT-compiled serializer for them.
// Matches the historical csvStringifyOptions shape: select via query.select
// (falls back to all non-calculated schema fields), x-originalName / title
// for headers, custom delimiter via query.sep, header opt-out via
// query.header === 'false'. \0 stripping is inlined by the serializer.
const compileForRequest = (dataset, query = {}, useTitle = false) => {
  const selectKeys = (query.select && query.select !== '*')
    ? query.select.split(',')
    : dataset.schema.filter(f => !f['x-calculated']).map(f => f.key)
  return getCsvSerializer({
    dataset,
    selectKeys,
    useTitle,
    delimiter: query.sep || ',',
    header: query.header !== 'false'
  })
}

const yieldEvery = 200

export const results2csv = async (req, results) => {
  const { prologue, row } = compileForRequest(req.dataset, req.query)
  const parts = new Array(results.length + 1)
  parts[0] = prologue
  for (let i = 0; i < results.length; i++) {
    parts[i + 1] = row(results[i])
    // yield to the event loop every `yieldEvery` rows; skip on the last row
    // and naturally never fires for small result sets
    if ((i + 1) % yieldEvery === 0 && i + 1 < results.length) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }
  return parts.join('')
}

export const csvStreams = (dataset, query = {}, useTitle = false) => {
  const { prologue, row } = compileForRequest(dataset, query, useTitle)
  let emitted = false
  return [
    new Transform({
      writableObjectMode: true,
      transform (item, encoding, callback) {
        if (!emitted) {
          emitted = true
          this.push(prologue + row(item))
        } else {
          this.push(row(item))
        }
        callback()
      },
      flush (callback) {
        // ensure an empty result set still produces the header row
        if (!emitted) {
          emitted = true
          this.push(prologue)
        }
        callback()
      }
    })
  ]
}

export const results2sheet = async (req, results, bookType) => {
  const dataset = req.dataset.__isProxy ? req.dataset.__proxyTarget : req.dataset
  const settings = await mongo.db.collection('settings')
    .findOne({ type: dataset.owner.type, id: dataset.owner.id }, { projection: { datasetsMetadata: 1 } })
  const buf = Buffer.from(await results2sheetPiscina.run({
    results,
    bookType,
    query: req.query,
    dataset,
    downloadUrl: req.publicBaseUrl + req.originalUrl,
    labels: req.__('sheets'),
    datasetsMetadata: settings?.datasetsMetadata ?? {}
  }))
  return buf
}

export const geojson2shp = async (geojson, baseName) => {
  return geojson2shpPiscina.run({ geojson: JSON.stringify(geojson), baseName })
}
