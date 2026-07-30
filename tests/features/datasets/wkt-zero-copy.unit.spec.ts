import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { result2wkt, rawEsBuffer2wkt } from '../../../api/src/datasets/utils/geo-features.ts'

// Byte-identity gate for the zero-copy format=wkt path (mirror of tile-zero-copy.unit.spec.ts). The NEW
// path parses the RAW ES response buffer in the render worker (threads/geojson2shp.ts `wkt` export, a
// one-line delegate to rawEsBuffer2wkt) then builds the GeometryCollection exactly like the historical
// main-thread result2wkt; both MUST yield the same WKT text. The worker also returns count + lastHitSort
// so read.ts reproduces the exact Link header the buffered path emitted. Imports go through the
// config-free geo-features.ts so the test needs no config/Piscina wiring.

const makeEsResponse = () => ({
  took: 2,
  timed_out: false,
  hits: {
    total: { value: 4, relation: 'eq' },
    hits: [
      { _id: 'a', _score: null, sort: [0], _source: { _geoshape: { type: 'Polygon', coordinates: [[[103.5, 0.5], [104.2, 1.1], [105.0, 0.9], [103.5, 0.5]]] }, label: 'poly' } },
      { _id: 'b', _score: null, sort: [1], _source: { _geopoint: '0.5,103.5', label: 'point' } },
      { _id: 'c', _score: null, sort: [2], _source: { label: 'no geometry at all' } },
      { _id: 'd', _score: null, sort: [3, 'tie'], _source: { _geoshape: { type: 'LineString', coordinates: [[103.5, 0.5], [104.2, 1.1]] } } }
    ]
  }
})

test.describe('zero-copy format=wkt byte-identity', () => {
  test('worker raw-buffer path produces WKT identical to the main-thread result2wkt', () => {
    const oldWkt = result2wkt(makeEsResponse())
    const rawBuffer = Buffer.from(JSON.stringify(makeEsResponse()))
    const res = rawEsBuffer2wkt(rawBuffer)
    assert.ok(oldWkt.startsWith('GEOMETRYCOLLECTION'))
    assert.equal(res.wkt.toString(), oldWkt)
  })

  test('count and lastHitSort reproduce what the buffered Link-header block read from esResponse', () => {
    const esResponse = makeEsResponse()
    const res = rawEsBuffer2wkt(Buffer.from(JSON.stringify(esResponse)))
    assert.equal(res.count, esResponse.hits.hits.length)
    assert.deepEqual(res.lastHitSort, esResponse.hits.hits[esResponse.hits.hits.length - 1].sort)
  })

  test('empty page: empty collection, no lastHitSort', () => {
    const res = rawEsBuffer2wkt(Buffer.from(JSON.stringify({ hits: { total: { value: 0 }, hits: [] } })))
    assert.equal(res.wkt.toString(), result2wkt({ hits: { hits: [] } }))
    assert.equal(res.count, 0)
    assert.equal(res.lastHitSort, undefined)
  })
})
