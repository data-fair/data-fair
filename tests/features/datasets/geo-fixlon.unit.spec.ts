import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { fixLon } from '../../../api/src/datasets/utils/geo-lon.ts'

// fixLon normalizes a longitude into [-180, 180]. It must be O(1): the previous
// implementation used while loops that never terminated for huge values such as
// Number.MAX_VALUE (~1.8e308), freezing the event loop on malicious bbox queries.

const inRange = (val: number) => val >= -180 && val <= 180

test.describe('fixLon', () => {
  test('keeps a normal longitude unchanged', () => {
    assert.equal(fixLon(0), 0)
    assert.equal(fixLon(90), 90)
    assert.equal(fixLon(-90), -90)
    // exactly, without the rounding noise of a modulo over the whole range
    assert.equal(fixLon(2.35), 2.35)
    assert.equal(fixLon(-74.006), -74.006)
    // 180 must stay positive: it is the right edge of a world-wide bbox and of the zoom 0 tile,
    // turning it into -180 collapses the ES envelope to zero width and matches nothing
    assert.equal(fixLon(180), 180)
    assert.equal(fixLon(-180), -180)
  })

  test('wraps longitudes beyond 180', () => {
    assert.equal(fixLon(190), -170)
    assert.equal(fixLon(360), 0)
    assert.equal(fixLon(540), 180)
  })

  test('wraps longitudes below -180', () => {
    assert.equal(fixLon(-190), 170)
    assert.equal(fixLon(-360), 0)
    assert.equal(fixLon(-540), -180)
  })

  test('handles very large values in O(1) without hanging', () => {
    assert.ok(inRange(fixLon(Number.MAX_VALUE)))
    assert.ok(inRange(fixLon(-Number.MAX_VALUE)))
  })

  test('passes non-finite values through unchanged', () => {
    assert.equal(fixLon(Infinity), Infinity)
    assert.equal(fixLon(-Infinity), -Infinity)
    assert.ok(Number.isNaN(fixLon(NaN)))
  })
})

// xyz2bbox builds the right edge of a tile as exactly 180 for the last column of every zoom level,
// and a world-wide bbox ends with 180 too: both must survive the normalization
test.describe('fixLon on bbox edges', () => {
  test('preserves the right edge of a world-wide bbox', () => {
    const worldBBOX = [-180, -90, 180, 90]
    assert.deepEqual([fixLon(worldBBOX[0]), fixLon(worldBBOX[2])], [-180, 180])
  })

  test('preserves the right edge of the zoom 0 tile', () => {
    const tile2long = (x: number, z: number) => (x / Math.pow(2, z) * 360 - 180)
    assert.deepEqual([fixLon(tile2long(0, 0)), fixLon(tile2long(1, 0))], [-180, 180])
  })
})
