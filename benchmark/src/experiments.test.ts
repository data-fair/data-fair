import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allExperiments, selectExperiments } from './experiments.ts'
import { getPreset } from './presets.ts'
import { generateSchema, schemaContext } from './generator.ts'

test('every variant body builds a valid ES query for its preset', () => {
  for (const exp of allExperiments) {
    const ctx = schemaContext(generateSchema(getPreset(exp.preset)))
    for (const v of [exp.baseline, ...exp.variants]) {
      const body = v.body(ctx)
      assert.ok(body.query, `${exp.name}/${v.name} produced no query`)
    }
  }
})

test('selectExperiments resolves a group prefix', () => {
  const tth = selectExperiments('track-total-hits')
  assert.ok(tth.length >= 3)
  assert.ok(tth.every(e => e.name.startsWith('track-total-hits:')))
})

test('selectExperiments resolves a single exact name', () => {
  const one = selectExperiments('search-catchall:wide-q')
  assert.equal(one.length, 1)
})

test('selectExperiments throws on an unknown name', () => {
  assert.throws(() => selectExperiments('bogus'), /unknown experiment/)
})
