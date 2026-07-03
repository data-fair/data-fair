import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'

// The geojson-string equivalence gate for the zero-copy shp export path. The shapefile ZIP itself is NOT
// byte-stable (ogr2ogr embeds timestamps), so the real correctness invariant is the geojson STRING fed to
// ogr2ogr's stdin. The NEW worker path parses the RAW ES response buffer (JSON.parse(rawBuffer)) with a
// SLIM dataset for flatten, then `JSON.stringify({ ...result2geojson, bbox })`; the OLD main-thread path
// runs result2geojson over the search() esResponse with the FULL dataset then `JSON.stringify` with bbox
// appended. Both MUST produce a byte-identical string ⇒ identical ogr2ogr input ⇒ identical shapefile.
//
// getFlatten imports #config (validated at import), so point node-config at the real api/config dir and load
// the config-dependent module via dynamic import AFTER — same pattern as lines-stream-parity.unit.spec.ts.
process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

// FULL dataset as the route sees it (carries extra, non-cloneable-ish props the slim copy drops).
const fullDataset: any = {
  id: 'shp-ds',
  slug: 'shp-ds',
  finalizedAt: '2024-01-01T00:00:00.000Z',
  owner: { type: 'user', id: 'u1' },
  schema: [
    { key: '_id', type: 'string' },
    { key: 'label', type: 'string', 'x-originalName': 'Label', title: 'Label' },
    { key: 'n', type: 'integer', 'x-calculated': false },
    { key: 'tags', type: 'string', separator: ',' }
  ]
}

// SLIM dataset exactly as geojson2shpFromBuffer builds it: id/finalizedAt + { key, separator } only.
const slimDataset: any = {
  id: fullDataset.id,
  finalizedAt: fullDataset.finalizedAt,
  schema: fullDataset.schema.map((p: any) => ({ key: p.key, separator: p.separator }))
}

// Fresh response each call — result2geojson MUTATES hit._source (deletes _geoshape/_geopoint), so the OLD
// and NEW paths must each start from an independent copy (exactly like search() vs JSON.parse in prod).
const makeEsResponse = () => ({
  took: 2,
  timed_out: false,
  _shards: { total: 1, successful: 1 },
  hits: {
    total: { value: 3, relation: 'eq' },
    max_score: null,
    hits: [
      { _id: 'a', _score: null, sort: [0], _source: { _geopoint: '0.5,103.5', label: 'point', n: 1, tags: ['x', 'y'] } },
      { _id: 'b', _score: null, sort: [1], _source: { _geoshape: { type: 'LineString', coordinates: [[103.5, 0.5], [104.2, 1.1], [105.0, 0.9]] }, label: 'line "q"', n: 2, tags: ['z'] } },
      { _id: 'c', _score: null, sort: [2], _source: { _geopoint: '1.2,104.0', label: 'p2', n: 3, tags: ['x'] } }
    ]
  }
})

const bbox = [103.5, 0.5, 105.0, 1.2]

test.describe('zero-copy shp export geojson-string equivalence', () => {
  test('worker string (slim dataset, JSON.parse(rawBuffer)) equals the old main-thread string (full dataset)', async () => {
    const { result2geojson } = await import('../../../api/src/datasets/utils/geo-features.ts') as any
    const { getFlatten } = await import('../../../api/src/datasets/utils/flatten.ts') as any

    // OLD main-thread path: full dataset flatten over the search() esResponse, bbox appended last.
    const oldStr = JSON.stringify({ ...result2geojson(makeEsResponse(), getFlatten(fullDataset, true)), bbox })

    // NEW worker path: serialize to a raw buffer, transfer, JSON.parse, slim dataset flatten, bbox appended last.
    const rawBuffer = Buffer.from(JSON.stringify(makeEsResponse()))
    const newStr = JSON.stringify({ ...result2geojson(JSON.parse(Buffer.from(rawBuffer).toString()), getFlatten(slimDataset, true)), bbox })

    assert.ok(oldStr.length > 0, 'geojson string should be non-empty')
    assert.equal(newStr, oldStr, 'ogr2ogr input string must be byte-identical (slim vs full dataset flatten)')
    // sanity: bbox is the LAST key (matches read.ts appending geojson.bbox AFTER result2geojson)
    assert.ok(oldStr.endsWith(`"bbox":${JSON.stringify(bbox)}}`), 'bbox must be the trailing key')
  })
})
