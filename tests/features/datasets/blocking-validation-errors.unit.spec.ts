import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { ajv } from '@data-fair/data-fair-shared/ajv.js'
import { cleanJsonSchemaProperty } from '@data-fair/data-fair-shared/schema.js'
import { blockingValidationErrors } from '../../../api/src/datasets/operations.ts'

// the same shapes as compileSchema in rest.ts: the dataset schema cleaned by cleanJsonSchemaProperty
const datasetSchema = [
  { key: 'str', type: 'string' },
  { key: 'req', type: 'string', 'x-required': true },
  { key: 'pat', type: 'string', pattern: '^test[0-9]$', patternErrorMessage: 'doit ressembler à test1' },
  { key: 'lab', type: 'string', 'x-labels': { a: 'A', b: 'B' }, 'x-labelsRestricted': true },
  { key: 'num', type: 'number', minimum: 0, maximum: 10 },
  { key: 'int', type: 'integer' },
  { key: 'len', type: 'string', minLength: 2, maxLength: 3 },
  { key: 'day', type: 'string', format: 'date' },
  { key: 'dt', type: 'string', format: 'date-time' },
  { key: 'url', type: 'string', format: 'uri-reference' },
  { key: 'multi', type: 'string', separator: ',' }
]
const validate = ajv.compile({
  type: 'object',
  required: datasetSchema.filter(p => p['x-required']).map(p => p.key),
  additionalProperties: false,
  properties: Object.fromEntries(datasetSchema.map(p => [p.key, cleanJsonSchemaProperty(p, 'http://localhost', 'http://localhost')]))
})
const blocking = (line: Record<string, any>) => {
  assert.equal(validate({ req: 'x', ...line }), false, 'the line must be invalid for the check to mean anything')
  return blockingValidationErrors(validate.errors).map((e: any) => e.instancePath)
}

test.describe('blockingValidationErrors', () => {
  test('the optional rules stay warnings', () => {
    assert.equal(validate({ req: 'x', str: 'a' }), true)
    for (const line of [
      { req: undefined },
      { pat: 'nope' },
      { lab: 'c' },
      { num: 11 },
      { num: -1 },
      { len: 'abcd' },
      { len: 'a' },
      { url: 'not a uri' }
    ]) {
      assert.deepEqual(blocking(line), [], JSON.stringify(line))
    }
  })

  test('a value of the wrong type, or an unparsable date, blocks', () => {
    assert.deepEqual(blocking({ str: 111 }), ['/str'])
    assert.deepEqual(blocking({ pat: 111 }), ['/pat'])
    assert.deepEqual(blocking({ int: 'abc' }), ['/int'])
    assert.deepEqual(blocking({ int: 1.5 }), ['/int'])
    assert.deepEqual(blocking({ num: 'abc' }), ['/num'])
    assert.deepEqual(blocking({ day: 'yesterday' }), ['/day'])
    assert.deepEqual(blocking({ dt: '2024-13-45T99:00:00Z' }), ['/dt'])
    assert.deepEqual(blocking({ multi: ['a', 1] }), ['/multi/1'])
    // mixed: only the type error is reported as blocking
    assert.deepEqual(blocking({ str: 111, pat: 'nope' }), ['/str'])
  })

  test('no errors, no blocking errors', () => {
    assert.deepEqual(blockingValidationErrors(null), [])
    assert.deepEqual(blockingValidationErrors(undefined), [])
  })
})
