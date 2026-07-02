import path from 'path'
import { Piscina } from 'piscina'
import _config from 'config'

const config = _config as any

export const geojson2pbfPiscina = new Piscina({
  filename: path.resolve(import.meta.dirname, '../../datasets/threads/geojson2pbf.js'),
  minThreads: 0,
  idleTimeout: 60 * 60 * 1000,
  maxThreads: config.tiles.maxThreads
})

function tile2long (x, z) {
  return (x / Math.pow(2, z) * 360 - 180)
}

function tile2lat (y, z) {
  const n = Math.PI - 2 * Math.PI * y / Math.pow(2, z)
  return (180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))))
}

// cf https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#ECMAScript_.28JavaScript.2FActionScript.2C_etc..29
export const xyz2bbox = (x, y, z) => {
  // left ,bottom,right,top
  return [tile2long(x, z), tile2lat(y + 1, z), tile2long(x + 1, z), tile2lat(y, z)]
}

export const geojson2pbf = async (geojson: any, xyz: any, vtPrepared?: any) => {
  if (!geojson || !geojson.features || !geojson.features.length) return null
  const buf = Buffer.from(await geojson2pbfPiscina.run({ geojson, xyz, vtPrepared }))
  return buf
}

// Zero-copy variant for the neighbors/non-vtPrepared vector-tile hot path: transfer the RAW ES response
// buffer to the worker (which parses + builds geojson + renders), rather than parsing/structured-cloning a
// geojson object graph on the main thread. Returns the ES count/total alongside the tile so the caller can
// set the same x-tilesampling header and VT cache entry the esResponse path produced.
export const geojson2pbfFromBuffer = async (rawBuffer: Buffer, xyz: any, dataset: any): Promise<{ tile: Buffer | null, count: number, total: number | undefined }> => {
  // A Node Buffer often shares a pooled ArrayBuffer with unrelated buffers, so transferring rawBuffer.buffer
  // could detach memory we don't own. Copy into a standalone ArrayBuffer and transfer THAT — after transfer
  // the main thread's view is detached, which is fine (we never reuse it).
  const standalone = new ArrayBuffer(rawBuffer.length)
  const view = new Uint8Array(standalone)
  view.set(rawBuffer)
  if (view.byteLength !== rawBuffer.length) throw new Error(`geojson2pbfFromBuffer: transfer buffer length mismatch (${view.byteLength} !== ${rawBuffer.length})`)
  // Pass only what getFlatten needs: id/finalizedAt (memoize key) + a minimal schema. compileFlatten reads
  // ONLY prop.key and prop.separator, so this keeps the compiled flatten (and thus the tile bytes) identical
  // while avoiding a DataCloneError — the full dataset/schema carries non-structured-cloneable values.
  const slimDataset = { id: dataset.id, finalizedAt: dataset.finalizedAt, schema: (dataset.schema ?? []).map((p: any) => ({ key: p.key, separator: p.separator })) }
  const { pbf, count, total } = await geojson2pbfPiscina.run({ rawBuffer: view, xyz, dataset: slimDataset }, { transferList: [standalone] })
  return { tile: count ? Buffer.from(pbf) : null, count, total }
}

export const defaultSelect = (dataset) => {
  return dataset.schema.filter(prop => {
    if (prop.key === '_id') return true
    if (prop.key === '_i') return true
    if (prop.key.startsWith('_')) return false
    if (prop.type === 'integer') return true
    if (prop.type === 'number') return true
    if (prop.type === 'boolean') return true
    if (prop.type === 'string' && prop.format === 'date-time') return true
    if (prop.type === 'string' && prop.format === 'date') return true
    if (prop.type === 'string' && prop['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') return false
    if (prop.type === 'string' && 'x-cardinality' in prop && prop['x-cardinality'] <= 50) return true
    if (prop.type === 'string' && prop['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label') return true
    return false
  }).map(prop => prop.key)
}
