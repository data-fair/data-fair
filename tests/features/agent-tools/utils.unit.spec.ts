import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  csvEscape,
  toCsv,
  cleanRow,
  buildPaginatedQuery,
  createAgentTranslator,
  agentToolError
} from '../../../ui/src/composables/agent/utils-logic.ts'

test.describe('csvEscape', () => {
  test('returns empty string for null/undefined', () => {
    assert.equal(csvEscape(null), '')
    assert.equal(csvEscape(undefined), '')
  })

  test('returns plain string unchanged', () => {
    assert.equal(csvEscape('hello'), 'hello')
  })

  test('wraps string with commas in quotes', () => {
    assert.equal(csvEscape('a,b'), '"a,b"')
  })

  test('wraps string with quotes and escapes inner quotes', () => {
    assert.equal(csvEscape('say "hi"'), '"say ""hi"""')
  })

  test('wraps string with newlines in quotes', () => {
    assert.equal(csvEscape('line1\nline2'), '"line1\nline2"')
  })

  test('converts numbers to string', () => {
    assert.equal(csvEscape(42), '42')
  })
})

test.describe('toCsv', () => {
  test('returns empty string for empty array', () => {
    assert.equal(toCsv([]), '')
  })

  test('converts single row', () => {
    const result = toCsv([{ name: 'Alice', age: 30 }])
    assert.equal(result, 'name,age\nAlice,30')
  })

  test('converts multiple rows', () => {
    const result = toCsv([
      { a: '1', b: '2' },
      { a: '3', b: '4' }
    ])
    assert.equal(result, 'a,b\n1,2\n3,4')
  })

  test('escapes special characters in values', () => {
    const result = toCsv([{ name: 'O"Brien', city: 'New York, NY' }])
    assert.equal(result, 'name,city\n"O""Brien","New York, NY"')
  })
})

test.describe('cleanRow', () => {
  test('removes _id, _i, _rand', () => {
    const row = { _id: '1', _i: 0, _rand: 123, name: 'Alice', age: 30 }
    const result = cleanRow(row)
    assert.deepEqual(result, { name: 'Alice', age: 30 })
  })

  test('returns empty object when only internal fields', () => {
    const result = cleanRow({ _id: '1', _i: 0, _rand: 123 })
    assert.deepEqual(result, {})
  })

  test('passes through row with no internal fields', () => {
    const row = { name: 'Alice' }
    const result = cleanRow(row)
    assert.deepEqual(result, { name: 'Alice' })
  })
})

test.describe('buildPaginatedQuery', () => {
  test('uses defaults when no params given', () => {
    const { query, page, size } = buildPaginatedQuery({})
    assert.equal(query.size, '10')
    assert.equal(query.page, '1')
    assert.equal(page, 1)
    assert.equal(size, 10)
  })

  test('clamps size to max 50', () => {
    const { size, query } = buildPaginatedQuery({ size: 100 })
    assert.equal(size, 50)
    assert.equal(query.size, '50')
  })

  test('clamps size to min 1', () => {
    const { size } = buildPaginatedQuery({ size: -5 })
    assert.equal(size, 1)
  })

  test('clamps page to min 1', () => {
    const { page } = buildPaginatedQuery({ page: 0 })
    assert.equal(page, 1)
  })

  test('includes q when provided', () => {
    const { query } = buildPaginatedQuery({ q: 'test' })
    assert.equal(query.q, 'test')
  })

  test('does not include q when empty', () => {
    const { query } = buildPaginatedQuery({})
    assert.equal(query.q, undefined)
  })

  test('merges extra params', () => {
    const { query } = buildPaginatedQuery({}, { owner: 'me' })
    assert.equal(query.owner, 'me')
  })
})

test.describe('createAgentTranslator', () => {
  const messages = {
    fr: { hello: 'Bonjour' },
    en: { hello: 'Hello', goodbye: 'Goodbye' }
  }

  test('returns translation for current locale', () => {
    const t = createAgentTranslator(messages, { value: 'fr' } as any)
    assert.equal(t('hello'), 'Bonjour')
  })

  test('falls back to English when key missing in locale', () => {
    const t = createAgentTranslator(messages, { value: 'fr' } as any)
    assert.equal(t('goodbye'), 'Goodbye')
  })

  test('falls back to key when missing from all locales', () => {
    const t = createAgentTranslator(messages, { value: 'fr' } as any)
    assert.equal(t('unknown_key'), 'unknown_key')
  })
})

test.describe('agentToolError', () => {
  test('formats Error instance', () => {
    const result = agentToolError('Failed', new Error('something broke'))
    assert.deepEqual(result, {
      content: [{ type: 'text', text: 'Failed: something broke' }],
      isError: true
    })
  })

  test('formats plain string', () => {
    const result = agentToolError('Failed', 'bad input')
    assert.deepEqual(result, {
      content: [{ type: 'text', text: 'Failed: bad input' }],
      isError: true
    })
  })
})
