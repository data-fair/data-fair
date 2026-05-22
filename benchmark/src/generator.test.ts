import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSchema, capabilityPresets, type DatasetSpec } from './generator.ts'

const spec: DatasetSpec = {
  id: 'bench-test',
  rows: 10,
  columns: [
    { type: 'string', count: 2, capabilities: capabilityPresets.fullText },
    { type: 'string', count: 1, capabilities: capabilityPresets.keywordOnly },
    { type: 'integer', count: 1 },
    { type: 'date', count: 1 }
  ],
  geo: true
}

test('generateSchema names fields by capability and type', () => {
  const schema = generateSchema(spec)
  assert.deepEqual(schema.map(f => f.key), ['text1', 'text2', 'kw1', 'int1', 'date1', 'lat', 'lon'])
})

test('generateSchema sets data-fair types and date format', () => {
  const schema = generateSchema(spec)
  const byKey = Object.fromEntries(schema.map(f => [f.key, f]))
  assert.equal(byKey.text1.type, 'string')
  assert.equal(byKey.int1.type, 'integer')
  assert.equal(byKey.date1.type, 'string')
  assert.equal(byKey.date1.format, 'date')
})

test('generateSchema attaches x-capabilities and geo refersTo', () => {
  const schema = generateSchema(spec)
  const byKey = Object.fromEntries(schema.map(f => [f.key, f]))
  assert.equal(byKey.kw1['x-capabilities']?.text, false)
  assert.equal(byKey.text1['x-capabilities']?.text, true)
  assert.equal(byKey.lat['x-refersTo'], 'http://schema.org/latitude')
})
