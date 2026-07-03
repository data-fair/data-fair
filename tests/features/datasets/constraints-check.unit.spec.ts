import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { checkConstraints } from '../../../api/src/datasets/utils/constraints.ts'

const schema = [
  { key: 'a', type: 'string' },
  { key: 'b', type: 'integer' },
  { key: 'calc', type: 'string', 'x-calculated': true },
  { key: 'noval', type: 'string', 'x-capabilities': { values: false } },
  { key: 'geom', type: 'string', 'x-refersTo': 'https://purl.org/geojson/vocab#geometry' },
  { key: 'obj', type: 'object' },
  { key: 'm', type: 'string', separator: ',' }
]

test.describe('checkConstraints', () => {
  test('accepts a valid multi-column unique constraint', () => {
    assert.doesNotThrow(() => checkConstraints(schema, [{ type: 'unique', properties: ['a', 'b'] }]))
  })

  test('rejects a nonexistent column', () => {
    assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: ['nope'] }]), /nope/)
  })

  test('rejects a calculated column', () => {
    assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: ['calc'] }]), /calcul/i)
  })

  test('rejects a column without the values capability', () => {
    assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: ['noval'] }]), /group/i)
  })

  test('rejects a geometry column', () => {
    assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: ['geom'] }]), /géométrie/i)
  })

  test('rejects an object column', () => {
    assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: ['obj'] }]), /objet/i)
  })

  test('rejects a multi-valued (separator) column', () => {
    assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: ['m'] }]), /multivalu/i)
  })

  test('rejects an empty properties list', () => {
    assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: [] }]), /au moins une colonne/i)
  })

  test('is a no-op for empty/absent constraints', () => {
    assert.doesNotThrow(() => checkConstraints(schema, []))
  })
})
