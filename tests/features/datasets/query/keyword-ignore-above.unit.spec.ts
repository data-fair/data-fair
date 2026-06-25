import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  KEYWORD_IGNORE_ABOVE,
  isLengthLimitedKeyword,
  resolveExactKeywordTarget,
  resolveExistsFields,
  resolveRangeOrPrefixField
} from '../../../../api/src/datasets/es/operations.ts'

const longVal = 'x'.repeat(KEYWORD_IGNORE_ABOVE + 1)
const shortVal = 'koumoul'
const plainStr = { key: 'c', type: 'string' }
const wildcardStr = { key: 'c', type: 'string', 'x-capabilities': { wildcard: true } }
const noTextStr = { key: 'c', type: 'string', 'x-capabilities': { text: false, textStandard: false } }
const numberProp = { key: 'n', type: 'number' }

test.describe('keyword ignore_above resolvers', () => {
  test('isLengthLimitedKeyword: only plain/uri-reference strings', () => {
    assert.equal(isLengthLimitedKeyword(plainStr), true)
    assert.equal(isLengthLimitedKeyword({ key: 'u', type: 'string', format: 'uri-reference' }), true)
    assert.equal(isLengthLimitedKeyword({ key: 'd', type: 'string', format: 'date-time' }), false)
    assert.equal(isLengthLimitedKeyword(numberProp), false)
  })

  test('isLengthLimitedKeyword: nativeWildcard and geometry-refersTo fields are excluded', () => {
    // nativeWildcard fields (e.g. _attachment_url) map to ES `wildcard` type — no ignore_above limit
    assert.equal(isLengthLimitedKeyword({ key: 'u', type: 'string', 'x-capabilities': { nativeWildcard: true } }), false)
    // geometry-refersTo string fields map to {type:keyword, index:false} — no ignore_above
    assert.equal(isLengthLimitedKeyword({ key: 'g', type: 'string', 'x-refersTo': 'https://purl.org/geojson/vocab#geometry' }), false)
  })

  test('exact target is operand-driven (no flag): short→keyword, long→wildcard|impossible', () => {
    assert.deepEqual(resolveExactKeywordTarget(plainStr, [shortVal]), { field: 'c' })
    assert.deepEqual(resolveExactKeywordTarget(plainStr, [longVal]), { impossible: true })
    assert.deepEqual(resolveExactKeywordTarget(wildcardStr, [longVal]), { field: 'c.wildcard' })
    assert.deepEqual(resolveExactKeywordTarget(wildcardStr, [shortVal]), { field: 'c' })
    assert.deepEqual(resolveExactKeywordTarget(numberProp, [longVal]), { field: 'n' })
  })

  test('exists fields: un-flagged column stays on the fast keyword path', () => {
    assert.deepEqual(resolveExistsFields(plainStr, false), ['c'])
  })

  test('exists fields: flagged plain column unions keyword + .text_standard', () => {
    assert.deepEqual(resolveExistsFields(plainStr, true), ['c', 'c.text_standard'])
  })

  test('exists fields: flagged wildcard column uses .wildcard', () => {
    assert.deepEqual(resolveExistsFields(wildcardStr, true), ['c.wildcard'])
  })

  test('exists fields: flagged pure-keyword column falls back to keyword only', () => {
    assert.deepEqual(resolveExistsFields(noTextStr, true), ['c'])
  })

  test('range/prefix: un-flagged stays keyword (not uncertain); flagged routes/flags', () => {
    assert.deepEqual(resolveRangeOrPrefixField(plainStr, false), { field: 'c', uncertain: false })
    assert.deepEqual(resolveRangeOrPrefixField(wildcardStr, true), { field: 'c.wildcard', uncertain: false })
    assert.deepEqual(resolveRangeOrPrefixField(plainStr, true), { field: 'c', uncertain: true })
    assert.deepEqual(resolveRangeOrPrefixField(numberProp, true), { field: 'n', uncertain: false })
  })
})
