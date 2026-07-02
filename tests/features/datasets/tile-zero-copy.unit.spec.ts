import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import geojsonvt from 'geojson-vt'
import vtpbf from 'vt-pbf'
import { result2geojson } from '../../../api/src/datasets/utils/geo-features.ts'
import { getFlatten } from '../../../api/src/datasets/utils/flatten.ts'

// Byte-identity gate for the zero-copy vector-tile path. The NEW path parses the RAW ES response buffer in
// the worker (JSON.parse(rawBuffer)) then runs result2geojson -> geojson-vt -> vt-pbf; the OLD path runs the
// same render over the esResponse object produced by search(). Both MUST yield byte-identical tiles. Uses a
// config-free inline render (fixed tolerance) so the test needs no config/Piscina wiring — the point is that
// the JSON round-trip through the raw buffer does not change a single output byte.

const dataset: any = {
  id: 'ds-tile',
  finalizedAt: '2024-01-01T00:00:00.000Z',
  schema: [
    { key: '_id', type: 'string' },
    { key: 'label', type: 'string' },
    { key: 'n', type: 'integer' },
    { key: 'tags', type: 'string', separator: ',' }
  ]
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

const render = (esResponse: any, flatten: any, xyz: number[]): Buffer => {
  const fc = result2geojson(esResponse, flatten)
  const tile = geojsonvt(fc as any, { indexMaxZoom: 0, tolerance: 3, maxZoom: xyz[2] })
    .getTile(xyz[2], xyz[0], xyz[1])
  const layers: any = {}
  if (tile) layers.results = tile
  return Buffer.from(vtpbf.fromGeojsonVt(layers, { version: 2 }))
}

test.describe('zero-copy vector tile byte-identity', () => {
  test('NEW raw-buffer path produces a tile byte-identical to the OLD esResponse path', () => {
    const flatten = getFlatten(dataset, true)
    const xyz = [0, 0, 0] // whole-world tile: guaranteed to contain every feature

    // OLD path: render directly over the esResponse object (as search() would return it)
    const oldTile = render(makeEsResponse(), flatten, xyz)

    // NEW path: serialize to a raw buffer, transfer to "worker", JSON.parse, then render
    const rawBuffer = Buffer.from(JSON.stringify(makeEsResponse()))
    const newTile = render(JSON.parse(Buffer.from(rawBuffer).toString()), flatten, xyz)

    assert.ok(oldTile.length > 0, 'tile should be non-empty')
    assert.ok(oldTile.equals(newTile), `tiles must be byte-identical (old=${oldTile.length}B new=${newTile.length}B)`)
  })

  test('count/total reproduced from the parsed raw buffer match the esResponse', () => {
    const flatten = getFlatten(dataset, true)
    const esResponse = JSON.parse(Buffer.from(Buffer.from(JSON.stringify(makeEsResponse()))).toString())
    const fc = result2geojson(esResponse, flatten)
    assert.equal(fc.features.length, 3)
    assert.equal(esResponse.hits.total?.value, 3)
  })
})
