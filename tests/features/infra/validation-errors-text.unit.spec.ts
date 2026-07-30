import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { ajv, errorsText, localize, valueAtPointer } from '@data-fair/data-fair-shared/ajv.js'

// helper: validate `data` against `schema`, localize errors in fr, return the
// shared errorsText output (value-aware when `data` is passed through).
const validateText = (schema: any, data: any) => {
  const validate = ajv.compile(schema)
  validate(data)
  localize.fr(validate.errors)
  return errorsText(validate.errors, '', data)
}

test.describe('value-aware errorsText', () => {
  test('appends the offending value for a type error', () => {
    const text = validateText(
      { type: 'object', properties: { age: { type: 'number' } } },
      { age: 'N/A' }
    )
    assert.equal(text, '/age doit être de type number (valeur : "N/A")')
  })

  test('does not append a value for a missing required property', () => {
    const text = validateText(
      { type: 'object', required: ['attr1'], properties: { attr1: { type: 'string' } } },
      {}
    )
    // no `(valeur : …)` tail — the value is the absence of the field
    assert.ok(!text.includes('valeur :'), text)
  })

  test('preserves a user-provided errorMessage and still shows the value', () => {
    const text = validateText(
      {
        type: 'object',
        properties: { code: { type: 'string', pattern: '^[A-Z]+$' } },
        errorMessage: { properties: { code: 'doit être en majuscules' } }
      },
      { code: 'abc' }
    )
    assert.ok(text.includes('doit être en majuscules'), text)
    assert.ok(text.includes('(valeur : "abc")'), text)
  })

  test('truncates an over-long value', () => {
    const long = 'x'.repeat(500)
    const text = validateText(
      { type: 'object', properties: { age: { type: 'number' } } },
      { age: long }
    )
    assert.ok(text.includes('…)'), text)
    assert.ok(text.length < 300, `expected truncated, got length ${text.length}`)
  })
})

test.describe('valueAtPointer', () => {
  test('resolves a top-level field', () => {
    assert.equal(valueAtPointer({ a: 1 }, '/a'), 1)
  })

  test('resolves a nested array element', () => {
    assert.equal(valueAtPointer({ attr3: ['x', 'y'] }, '/attr3/1'), 'y')
  })

  test('returns undefined for a missing path', () => {
    assert.equal(valueAtPointer({ a: { b: 1 } }, '/a/c'), undefined)
  })

  test('decodes JSON-pointer escapes (~1 -> /, ~0 -> ~)', () => {
    assert.equal(valueAtPointer({ 'a/b': 1 }, '/a~1b'), 1)
  })

  test('returns undefined for an empty pointer', () => {
    assert.equal(valueAtPointer({ a: 1 }, ''), undefined)
  })
})
