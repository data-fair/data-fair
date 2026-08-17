import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSchema, capabilityPresets, type DatasetSpec, generateRows, rowIterator, schemaContext, analyzedSubfields } from './generator.ts'

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

test('generateRows is deterministic for a fixed seed', () => {
  const a = generateRows(spec, 5)
  const b = generateRows(spec, 5)
  assert.deepEqual(a, b)
  assert.equal(a.length, 5)
})

test('generated rows carry every schema field plus _id', () => {
  const [row] = generateRows(spec, 1)
  assert.equal(row._id, 'row-0')
  for (const key of ['text1', 'text2', 'kw1', 'int1', 'date1', 'lat', 'lon']) {
    assert.ok(key in row, `missing ${key}`)
  }
  assert.equal(typeof row.int1, 'number')
})

test('rowIterator yields the same rows as generateRows', () => {
  assert.deepEqual([...rowIterator(spec, 3)], generateRows(spec, 3))
})

test('schemaContext groups fields by capability', () => {
  const ctx = schemaContext(generateSchema(spec))
  assert.deepEqual(ctx.fullTextFields, ['text1', 'text2'])
  assert.deepEqual(ctx.keywordFields, ['kw1'])
  assert.deepEqual(ctx.numberFields, ['int1'])
  assert.deepEqual(ctx.dateFields, ['date1'])
  assert.deepEqual(ctx.geoFields, ['lat', 'lon'])
})

test('analyzedSubfields reflects capabilities', () => {
  const schema = generateSchema(spec)
  const text1 = schema.find(f => f.key === 'text1')!
  const kw1 = schema.find(f => f.key === 'kw1')!
  assert.deepEqual(analyzedSubfields(text1), ['text', 'text_standard'])
  assert.deepEqual(analyzedSubfields(kw1), [])
})
