import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { lineBytes, lineBytesSpec } from '../../../../api/src/datasets/es/operations.ts'
import { getCsvSerializer } from '../../../../api/src/datasets/utils/csv-jit.ts'
import { getFlattenNoCache } from '../../../../api/src/datasets/utils/flatten.ts'

// `_bytes` is defined as the byte length of the row the default CSV export (`/lines?format=csv`,
// no select, ',' delimiter) would emit for the line — header and BOM excluded.

const schema = [
  { key: 'name', type: 'string' },
  { key: 'nb', type: 'integer' },
  { key: 'flag', type: 'boolean' },
  { key: 'tags', type: 'string', separator: ';' },
  { key: '_i', type: 'integer', 'x-calculated': true },
  { key: '_updatedAt', type: 'string', 'x-calculated': true },
  { key: '_ext_geo.lat', type: 'number', 'x-extension': 'geo/coords' },
  { key: '_ext_geo.lon', type: 'number', 'x-extension': 'geo/coords' },
  { key: '_ext_geo.error', type: 'string', 'x-extension': 'geo/coords', 'x-calculated': true }
]
const dataset = { id: 'ds1', finalizedAt: '2026-01-01T00:00:00Z', schema }

test.describe('lineBytes', () => {
  test('equals the byte length of the default CSV export row', () => {
    const spec = lineBytesSpec(dataset)
    // string quoted, boolean as 1/0, separator array joined then quoted, nested extension flattened,
    // calculated columns (_i, _updatedAt, _ext_geo.error) excluded
    const item = { name: 'a"b', nb: 12, flag: true, tags: ['x', 'y'], _ext_geo: { lat: 1.5, lon: 48, error: 'boom' }, _i: 4, _updatedAt: '2026-01-01' }
    // "a""b",12,1,"x;y",1.5,48\n
    assert.equal(lineBytes(item, spec), 25)

    // same figure as what the /lines csv serializer produces for the flattened line
    const selectKeys = schema.filter(p => !p['x-calculated']).map(p => p.key)
    const { row } = getCsvSerializer({ dataset, selectKeys, header: false, bom: false })
    const flatten = getFlattenNoCache(dataset)
    assert.equal(lineBytes(item, spec), Buffer.byteLength(row(flatten({ ...item }))))
  })

  test('does not mutate the indexed line', () => {
    const spec = lineBytesSpec(dataset)
    const item = { name: 'abc', tags: ['x', 'y'], _ext_geo: { lat: 1.5, lon: 48 } }
    lineBytes(item, spec)
    assert.deepEqual(item, { name: 'abc', tags: ['x', 'y'], _ext_geo: { lat: 1.5, lon: 48 } })
  })

  test('multi-byte UTF-8 strings are measured in bytes', () => {
    const spec = lineBytesSpec({ id: 'ds2', schema: [{ key: 'name', type: 'string' }] })
    // "é"\n -> 2 quotes + 2 bytes + newline
    assert.equal(lineBytes({ name: 'é' }, spec), 5)
  })

  test('missing and null values emit empty cells but keep their delimiters and newline', () => {
    const spec = lineBytesSpec({ id: 'ds3', schema: [{ key: 'a', type: 'string' }, { key: 'b', type: 'integer' }, { key: 'c', type: 'boolean' }] })
    // ,,\n
    assert.equal(lineBytes({ a: null, b: undefined }, spec), 3)
  })

  test('internal non-schema keys are ignored', () => {
    const spec = lineBytesSpec({ id: 'ds4', schema: [{ key: 'flag', type: 'boolean' }] })
    // 1\n
    assert.equal(lineBytes({ flag: true, _file_raw: 'aaaaaaaaaa', _geopoint: '1,2' }, spec), 2)
  })
})
