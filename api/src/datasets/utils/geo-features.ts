// Config-free per-hit GeoJSON builders extracted from geo.ts so they can be imported by lightweight
// contexts (the streamed geojson pipeline and the geojson2pbf render worker) WITHOUT pulling in geo.ts's
// heavy deps (config/turf/proj4/child-process). geo.ts re-exports them so existing importers
// (shp/tiles/wkt) keep working unchanged.
import { getFlatten } from './flatten.ts'

// Per-hit GeoJSON Feature builder — shared by result2geojson (buffered: geojson2shp, vector tiles) and the
// streamed geojson pipeline (lines-pipeline.ts streamGeojson), so both produce identical features.
export const hit2feature = (hit: any, flatten: (o: Record<string, any>) => Record<string, any>) => {
  const properties = hit._source
  let geometry = properties._geoshape
  delete properties._geoshape
  if (!geometry && properties._geopoint) {
    const [lat, lon] = properties._geopoint.split(',')
    delete properties._geopoint
    geometry = { type: 'Point', coordinates: [Number(lon), Number(lat)] }
  }
  properties._id = hit._id
  return {
    type: 'Feature',
    id: hit._id,
    geometry,
    properties: flatten(properties)
  }
}

export const result2geojson = (esResponse: any, flatten: (o: Record<string, any>) => Record<string, any>) => {
  return {
    type: 'FeatureCollection',
    total: esResponse.hits.total?.value,
    features: esResponse.hits.hits.map((hit: any) => hit2feature(hit, flatten))
  }
}

// Shared prelude of both zero-copy workers (geojson2pbf, geojson2shp): wrap the TRANSFERRED bytes without
// copying (after transfer the worker owns the ArrayBuffer exclusively — Buffer.from(uint8) would memcpy
// the whole response a second time), parse, and build the FeatureCollection.
export const rawEsBuffer2geojson = (rawBuffer: Uint8Array, dataset: any): { esResponse: any, geojson: any } => {
  const esResponse = JSON.parse(Buffer.from(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength).toString())
  return { esResponse, geojson: result2geojson(esResponse, getFlatten(dataset, true)) }
}
