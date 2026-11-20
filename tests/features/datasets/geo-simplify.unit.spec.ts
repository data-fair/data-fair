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
  test('counts linestring and multilinestring entries', () => {
    assert.equal(countVertices({ type: 'LineString', coordinates: [[0, 0], [1, 1], [2, 2]] }), 3)
    assert.equal(countVertices({ type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3], [4, 4]]] }), 5)
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

  test('drops zero-area polygons and holes instead of failing the whole simplification', () => {
    const big = circlePolygon(20000)
    // a ring of aligned points: cleanCoords leaves fewer than 4 points, @turf/simplify used to throw
    const flat = [[10, 10], [11, 10], [12, 10], [10, 10]]
    const square = [[20, 20], [20, 21], [21, 21], [21, 20], [20, 20]]
    const mp = { type: 'MultiPolygon', coordinates: [big.coordinates, [flat], [square, flat]] }
    const out = simplifyToVertexBudget(mp as any, 5000) as any
    assert.ok(countVertices(out) <= 5000, `expected <=5000 got ${countVertices(out)}`)
    assert.equal(out.coordinates.length, 2, 'the zero-area polygon is dropped, the real ones kept')
    assert.equal(out.coordinates[1].length, 1, 'the zero-area hole is dropped')
    assert.equal(mp.coordinates.length, 3, 'the input geometry is left untouched')
    const poly = { type: 'Polygon', coordinates: [big.coordinates[0], flat] }
    assert.equal((simplifyToVertexBudget(poly as any, 5000) as any).coordinates.length, 1)
  })
  test('still reports a geometry with no area at all as invalid', () => {
    const flat = [[10, 10], [11, 10], [12, 10], [10, 10]]
    const mp = { type: 'MultiPolygon', coordinates: Array.from({ length: 10 }, () => [flat]) }
    assert.throws(() => simplifyToVertexBudget(mp as any, 5), /invalid polygon/)
  })
  test('goes straight to the last tolerance when the budget is below the parts floor', () => {
    // 2000 small 5-point squares: rings keep 4 entries at least, the floor (8000) is above the budget
    const coordinates = Array.from({ length: 2000 }, (_, i) => [[[i, 0], [i, 0.5], [i, 1], [i + 0.5, 1], [i, 0]]])
    const mp = { type: 'MultiPolygon', coordinates }
    const out = simplifyToVertexBudget(mp as any, 5000)
    assert.equal(countVertices(out), 8000, 'each ring reduced to its 4-entry floor')
  })
})
