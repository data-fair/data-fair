import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { checkConstraints } from '../src/datasets/utils/constraints.ts'

const schema = [
  { key: 'a', type: 'string' },
  { key: 'b', type: 'integer' },
  { key: 'calc', type: 'string', 'x-calculated': true },
  { key: 'noval', type: 'string', 'x-capabilities': { values: false } }
]

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

test('rejects an empty properties list', () => {
  assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: [] }]), /au moins une colonne/i)
})

test('is a no-op for empty/absent constraints', () => {
  assert.doesNotThrow(() => checkConstraints(schema, []))
})
