import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { countVertices, simplifyToVertexBudget } from '../../../api/src/datasets/utils/geo-simplify.ts'

// deterministic many-vertex polygon (a sampled circle) for large-geometry cases
const circlePolygon = (n: number) => {
  const ring: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI
    ring.push([Math.cos(a), Math.sin(a)])
  }
  ring.push(ring[0])
  return { type: 'Polygon' as const, coordinates: [ring] }
}

test.describe('countVertices', () => {
  test('counts a Point as 1', () => {
    assert.equal(countVertices({ type: 'Point', coordinates: [1, 2] }), 1)
  })
  test('counts every polygon ring coordinate, including the closing point', () => {
    // ring has 4 coordinate entries (the last closes the ring); all count toward size
    assert.equal(countVertices({ type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] }), 4)
  })
  test('sums multipolygon and geometrycollection', () => {
    const mp = { type: 'MultiPolygon', coordinates: [[[[0, 0], [0, 1], [1, 1], [0, 0]]], [[[5, 5], [5, 6], [6, 6], [5, 5]]]] }
    assert.equal(countVertices(mp as any), 8) // two rings of 4 coordinate entries each
    assert.equal(countVertices({ type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [0, 0] }, mp] } as any), 9) // 1 + 8
  })
})

test.describe('simplifyToVertexBudget', () => {
  test('returns the same geometry (identity) when already under budget', () => {
    const g = { type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] }
    assert.equal(simplifyToVertexBudget(g as any, 50000), g)
  })
  test('reduces an oversized geometry to <= budget', () => {
    const big = circlePolygon(20000)
    assert.ok(countVertices(big) > 5000)
    const out = simplifyToVertexBudget(big, 5000)
    assert.ok(countVertices(out) <= 5000, `expected <=5000 got ${countVertices(out)}`)
    assert.equal(out.type, 'Polygon')
  })
  test('is disabled when budget is -1 (identity even for a huge geometry)', () => {
    const big = circlePolygon(20000)
    assert.equal(simplifyToVertexBudget(big, -1), big)
  })
  test('passes geometries that @turf/simplify cannot handle through unchanged', () => {
    const mpt = { type: 'MultiPoint', coordinates: [[0, 0], [1, 1], [2, 2]] }
    assert.equal(simplifyToVertexBudget(mpt as any, 1), mpt) // over budget but unsupported type -> identity
  })
})
