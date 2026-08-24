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
    assert.ok(Math.abs(fixLon(180)) === 180)
    assert.ok(Math.abs(fixLon(-180)) === 180)
  })

  test('wraps longitudes beyond 180', () => {
    assert.equal(fixLon(190), -170)
    assert.equal(fixLon(360), 0)
    assert.ok(Math.abs(fixLon(540)) === 180)
  })

  test('wraps longitudes below -180', () => {
    assert.equal(fixLon(-190), 170)
    assert.equal(fixLon(-360), 0)
    assert.ok(Math.abs(fixLon(-540)) === 180)
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
