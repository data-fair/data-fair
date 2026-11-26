import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { createFeatureVertexCounter } from '../../../api/src/datasets/utils/geojson-feature-size.ts'

const ring = (n: number, z = false) => {
  const coords = Array.from({ length: n - 1 }, (_, i) => z ? [i, -i * 1.5, 0.0] : [i, -i * 1.5e-3])
  return [...coords, coords[0]]
}
const featureCollection = (...features: any[]) => JSON.stringify({
  type: 'FeatureCollection',
  name: 'test',
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
  bbox: [0, 0, 1, 1],
  features
})
const polygonFeature = (n: number, properties: any = {}, z = false) =>
  ({ type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring(n, z)] } })

// feeds the text in chunks of the given size, returns the first verdict
const scan = (text: string, max: number, chunkSize = text.length) => {
  const counter = createFeatureVertexCounter(max)
  for (let i = 0; i < text.length; i += chunkSize) {
    const res = counter.write(text.slice(i, i + chunkSize))
    if (res) return res
  }
  return null
}

test.describe('geojson feature vertex counter', () => {
  test('accepts features at the limit, counting each feature separately', () => {
    const text = featureCollection(polygonFeature(10), polygonFeature(10), polygonFeature(10, {}, true))
    assert.equal(scan(text, 10), null)
  })
  test('reports the first feature over the limit with its index', () => {
    const text = featureCollection(polygonFeature(10), polygonFeature(11), polygonFeature(50))
    assert.deepEqual(scan(text, 10), { index: 1, vertices: 11 })
  })
  test('gives the same verdict whatever the chunk boundaries', () => {
    const text = featureCollection(polygonFeature(5, { 'a "[1, 2]" \\" [3,4]': '[[5,6],[7,8]]' }), polygonFeature(12, { list: [1, 2, 3] }))
    for (const chunkSize of [1, 2, 3, 7, 64]) {
      assert.deepEqual(scan(text, 10, chunkSize), { index: 1, vertices: 11 }, `chunk size ${chunkSize}`)
    }
  })
  test('scans utf-8 bytes like text, even with a multi-byte character split across chunks', () => {
    const text = featureCollection(polygonFeature(5, { nom: 'Île-Rousse – «[1,2]»' }), polygonFeature(12, { nom: 'Ajaccio' }))
    const bytes = Buffer.from(text)
    for (const chunkSize of [1, 3, 64]) {
      const counter = createFeatureVertexCounter(10)
      let res = null
      for (let i = 0; i < bytes.length && !res; i += chunkSize) res = counter.write(bytes.subarray(i, i + chunkSize))
      assert.deepEqual(res, { index: 1, vertices: 11 }, `chunk size ${chunkSize}`)
    }
  })
  test('ignores numbers in strings and property values, and the root bbox', () => {
    const props = { id: 12, label: '[[1,2],[3,4],[5,6]]', 'nested "quote\\" [9,9]': { x: -1, y: [-2.5e3] } }
    // 4 ring vertices + 1 for the numeric property array, which looks like a coordinate tuple
    assert.equal(scan(featureCollection(polygonFeature(4, props)), 5), null)
    assert.deepEqual(scan(featureCollection(polygonFeature(4, props)), 4), { index: 0, vertices: 5 })
  })
  test('counts multipolygon parts and multipoint coordinates of a single feature together', () => {
    const multi = { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: [[ring(4)], [ring(4), ring(4)]] } }
    assert.deepEqual(scan(featureCollection(multi), 11), { index: 0, vertices: 12 })
    const points = { type: 'Feature', properties: {}, geometry: { type: 'MultiPoint', coordinates: [[0, 0], [1, 1], [2, 2]] } }
    assert.equal(scan(featureCollection(points, points), 3), null)
  })
})
