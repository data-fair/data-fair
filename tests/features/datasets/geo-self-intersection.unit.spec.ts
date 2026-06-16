import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { geometrySelfIntersects } from '../../../api/src/datasets/utils/geo-self-intersection.ts'

// geometrySelfIntersects replaces the former O(n^2) @turf/kinks detection with a
// sweep-line algorithm. These cases pin the parity we verified against @turf/kinks:
// the boolean "does this polygon self-intersect?" must be identical.

test.describe('geometrySelfIntersects', () => {
  test('returns false for a valid square', () => {
    assert.equal(geometrySelfIntersects({ type: 'Polygon', coordinates: [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]] }), false)
  })

  test('returns true for a self-intersecting bowtie', () => {
    assert.equal(geometrySelfIntersects({ type: 'Polygon', coordinates: [[[0, 0], [2, 2], [2, 0], [0, 2], [0, 0]]] }), true)
  })

  test('returns false for a valid polygon with a hole', () => {
    assert.equal(geometrySelfIntersects({
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]], [[2, 2], [2, 4], [4, 4], [4, 2], [2, 2]]]
    }), false)
  })

  test('returns false for a valid multipolygon', () => {
    assert.equal(geometrySelfIntersects({
      type: 'MultiPolygon',
      coordinates: [[[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]], [[[5, 5], [5, 7], [7, 7], [7, 5], [5, 5]]]]
    }), false)
  })

  test('returns true when a single ring of a multipolygon is a bowtie', () => {
    assert.equal(geometrySelfIntersects({
      type: 'MultiPolygon',
      coordinates: [[[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]], [[[5, 5], [7, 7], [7, 5], [5, 7], [5, 5]]]]
    }), true)
  })

  test('returns false for non-polygon geometries', () => {
    assert.equal(geometrySelfIntersects({ type: 'Point', coordinates: [0, 0] } as any), false)
    assert.equal(geometrySelfIntersects({ type: 'LineString', coordinates: [[0, 0], [1, 1]] } as any), false)
  })
})
