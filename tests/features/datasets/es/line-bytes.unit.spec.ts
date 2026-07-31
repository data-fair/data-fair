import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { lineBytes, lineBytesSpec } from '../../../../api/src/datasets/es/operations.ts'

const schema = [
  { key: 'name' },
  { key: 'nb' },
  { key: '_i', 'x-calculated': true },
  { key: '_updatedAt', 'x-calculated': true },
  { key: '_ext_geo.lat', 'x-extension': 'geo/coords' },
  { key: '_ext_geo.lon', 'x-extension': 'geo/coords' }
]

test.describe('lineBytes', () => {
  test('counts non-calculated schema columns', () => {
    const spec = lineBytesSpec(schema)
    // counted props: name, nb, _ext_geo.lat, _ext_geo.lon -> nbCols = 4
    assert.equal(spec.nbCols, 4)
    // top-level prefixes: name, nb, _ext_geo
    assert.deepEqual([...spec.prefixes].sort(), ['_ext_geo', 'name', 'nb'])
  })

  test('sums stringified value bytes plus one byte per column', () => {
    const spec = lineBytesSpec(schema)
    const item = { name: 'abc', nb: 12, _ext_geo: { lat: 1.5, lon: 48 }, _i: 4, _updatedAt: '2026-01-01' }
    // 'abc'(3) + '12'(2) + '1.5'(3) + '48'(2) + 4 separators = 14
    assert.equal(lineBytes(item, spec), 14)
  })

  test('multi-byte UTF-8 strings are measured in bytes', () => {
    const spec = lineBytesSpec([{ key: 'name' }])
    // 'é' is 2 bytes in UTF-8 -> 2 + 1 separator = 3
    assert.equal(lineBytes({ name: 'é' }, spec), 3)
  })

  test('missing and null values count zero bytes but keep their separator', () => {
    const spec = lineBytesSpec([{ key: 'a' }, { key: 'b' }, { key: 'c' }])
    assert.equal(lineBytes({ a: null, b: undefined }, spec), 3)
  })

  test('booleans stringified, internal non-schema keys ignored', () => {
    const spec = lineBytesSpec([{ key: 'flag' }])
    // 'true'(4) + 1 = 5 ; _file_raw and _geopoint must not count
    assert.equal(lineBytes({ flag: true, _file_raw: 'aaaaaaaaaa', _geopoint: '1,2' }, spec), 5)
  })
})
