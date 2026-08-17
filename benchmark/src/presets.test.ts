import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presets, getPreset } from './presets.ts'
import { generateSchema, analyzedSubfields } from './generator.ts'

test('all four presets exist with fixed ids', () => {
  assert.deepEqual(Object.keys(presets).sort(), ['mixed', 'small', 'tall', 'wide-text'])
  assert.equal(presets.tall.id, 'bench-tall')
})

test('wide-text crosses the _search catch-all threshold (>= 30 analyzed sub-fields)', () => {
  const schema = generateSchema(getPreset('wide-text'))
  const analyzed = schema.reduce((n, f) => n + analyzedSubfields(f).length, 0)
  assert.ok(analyzed >= 30, `expected >= 30 analyzed sub-fields, got ${analyzed}`)
})

test('getPreset returns an independent clone', () => {
  const a = getPreset('small')
  a.rows = 999
  assert.notEqual(getPreset('small').rows, 999)
})

test('getPreset throws on an unknown name', () => {
  assert.throws(() => getPreset('nope'), /unknown preset/)
})
