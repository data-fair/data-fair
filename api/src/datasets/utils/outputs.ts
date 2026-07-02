import { Transform } from 'stream'
import path from 'path'
import { Piscina } from 'piscina'
import mongo from '#mongo'
import { getCsvSerializer } from './csv-jit.ts'
import { reqPublicBaseUrl } from '../../misc/utils/public-base-url.ts'
import { reqDataset } from '../../misc/utils/req-context.ts'
import type { Request } from 'express'
import type { Dataset } from '#types'

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
export const compileForRequest = (dataset: Dataset, query: Record<string, string> = {}, useTitle = false) => {
  const selectKeys = (query.select && query.select !== '*')
    ? query.select.split(',')
    : (dataset.schema ?? []).filter(f => !f['x-calculated']).map(f => f.key)
  return getCsvSerializer({
    dataset,
    selectKeys,
    useTitle,
    delimiter: query.sep || ',',
    header: query.header !== 'false'
  })
}

const yieldEvery = 200

export type ReqWithDataset = Request & {
  dataset: Dataset,
  query: Record<string, string>,
  __: (key: string) => any
}

export const results2csv = async (req: ReqWithDataset, results: Record<string, any>[]): Promise<string> => {
  const { prologue, row } = compileForRequest(reqDataset(req), req.query)
  const parts = new Array(results.length + 1)
  parts[0] = prologue
  for (let i = 0; i < results.length; i++) {
    parts[i + 1] = row(results[i])
    // yield to the event loop every `yieldEvery` rows; skip on the last row
    // and naturally never fires for small result sets
    if ((i + 1) % yieldEvery === 0 && i + 1 < results.length) {
      // setImmediate, not setTimeout(0): timers are clamped to ~1ms and run in a later loop phase
      await new Promise(resolve => setImmediate(resolve))
    }
  }
  return parts.join('')
}

export const csvStreams = (dataset: Dataset, query: Record<string, string> = {}, useTitle = false): Transform[] => {
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

export const results2sheet = async (req: ReqWithDataset, results: Record<string, any>[], bookType: string = 'xlsx'): Promise<Buffer> => {
  const rawDataset = reqDataset(req) as Dataset & { __isProxy?: boolean, __proxyTarget?: Dataset }
  const dataset = rawDataset.__isProxy ? rawDataset.__proxyTarget as Dataset : rawDataset
  const settings = await mongo.db.collection('settings')
    .findOne({ type: dataset.owner.type, id: dataset.owner.id }, { projection: { datasetsMetadata: 1 } })
  const buf = Buffer.from(await results2sheetPiscina.run({
    results,
    bookType,
    query: req.query,
    dataset,
    downloadUrl: reqPublicBaseUrl(req) + req.originalUrl,
    labels: req.__('sheets'),
    datasetsMetadata: (settings as { datasetsMetadata?: any } | null)?.datasetsMetadata ?? {}
  }))
  return buf
}

export const geojson2shp = async (geojson: any, baseName: string): Promise<any> => {
  return geojson2shpPiscina.run({ geojson: JSON.stringify(geojson), baseName })
}

// Zero-copy variant for the shp export hot path (mirror of tiles.geojson2pbfFromBuffer): transfer the RAW ES
// response buffer to the worker (which parses + builds geojson + JSON.stringifies + feeds ogr2ogr), rather
// than parsing/structured-cloning a geojson object graph on the main thread. bbox is a separate agg computed
// by the caller and appended to the geojson LAST (matching the old read.ts key order type/total/features/bbox).
export const geojson2shpFromBuffer = async (rawBuffer: Buffer, bbox: any, baseName: string, dataset: any): Promise<any> => {
  // A Node Buffer often shares a pooled ArrayBuffer with unrelated buffers, so transferring rawBuffer.buffer
  // could detach memory we don't own. Copy into a standalone ArrayBuffer and transfer THAT — after transfer
  // the main thread's view is detached, which is fine (we never reuse it).
  const standalone = new ArrayBuffer(rawBuffer.length)
  const view = new Uint8Array(standalone)
  view.set(rawBuffer)
  if (view.byteLength !== rawBuffer.length) throw new Error(`geojson2shpFromBuffer: transfer buffer length mismatch (${view.byteLength} !== ${rawBuffer.length})`)
  // Pass only what getFlatten needs: id/finalizedAt (memoize key) + a minimal schema. compileFlatten reads
  // ONLY prop.key and prop.separator, so this keeps the compiled flatten (and thus the geojson string fed to
  // ogr2ogr) identical while avoiding a DataCloneError — the full dataset/schema carries non-cloneable values.
  const slimDataset = { id: dataset.id, finalizedAt: dataset.finalizedAt, schema: (dataset.schema ?? []).map((p: any) => ({ key: p.key, separator: p.separator })) }
  return geojson2shpPiscina.run({ rawBuffer: view, bbox, baseName, dataset: slimDataset }, { transferList: [standalone] })
}
