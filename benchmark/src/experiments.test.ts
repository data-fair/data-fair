import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allExperiments, selectExperiments } from './experiments.ts'
import { getPreset } from './presets.ts'
import { generateSchema, schemaContext, type SchemaContext } from './generator.ts'

test('every variant body builds a valid ES query for its preset', () => {
  for (const exp of allExperiments) {
    // prepare-based experiments build their own index; their bodies ignore the preset ctx
    const ctx = exp.prepare ? schemaContext([]) : schemaContext(generateSchema(getPreset(exp.preset)))
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

// --- field-targeting guard (catches experiments querying invalid fields — e.g. an
// analyzed column queried via its keyword main when the experiment meant .text) ---

function referencedFields (node: any): string[] {
  if (!node || typeof node !== 'object') return []
  const fields: string[] = []
  if (Array.isArray(node.simple_query_string?.fields)) fields.push(...node.simple_query_string.fields)
  if (node.match && typeof node.match === 'object') fields.push(...Object.keys(node.match))
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const v of value) fields.push(...referencedFields(v))
    else if (value && typeof value === 'object') fields.push(...referencedFields(value))
  }
  return fields
}

function isValidQueryTarget (field: string, ctx: SchemaContext): boolean {
  if (field === '_search' || field === '_search.text_standard') return true
  // pure-keyword columns are a valid query target (they have no analyzed inner field —
  // their main keyword IS the search surface, e.g. the keyword-main-in-q experiment)
  if (ctx.keywordFields.includes(field)) return true
  const m = field.match(/^(.+)\.(text|text_standard)$/)
  return m !== null && ctx.fullTextFields.includes(m[1])
}

test('experiment queries target valid analyzed-text or pure-keyword fields', () => {
  for (const exp of allExperiments) {
    // prepare-based experiments target their own self-built mapping, not a preset's
    if (exp.prepare) continue
    const ctx = schemaContext(generateSchema(getPreset(exp.preset)))
    for (const v of [exp.baseline, ...exp.variants]) {
      for (const field of referencedFields(v.body(ctx).query)) {
        assert.ok(isValidQueryTarget(field, ctx),
          `${exp.name}/${v.name} targets invalid field "${field}"`)
      }
    }
  }
})
