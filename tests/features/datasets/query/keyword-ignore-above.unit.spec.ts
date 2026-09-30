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
// how prepareSchema configures a textarea/markdown column: analyzed text only
const textOnlyStr = { key: 'c', type: 'string', 'x-capabilities': { index: false, values: false, insensitive: false } }
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

  test('exists fields: flagged plain column unions keyword + both analyzed views', () => {
    // union of `.text_standard` (legacy indexes) and `.text` (new single-text-field shape); the
    // one that is unmapped on the target index is silently ignored by ES, so no shape branch.
    assert.deepEqual(resolveExistsFields(plainStr, true), ['c', 'c.text_standard', 'c.text'])
  })

  test('exists fields: flagged wildcard column uses .wildcard', () => {
    assert.deepEqual(resolveExistsFields(wildcardStr, true), ['c.wildcard'])
  })

  test('exists fields: flagged pure-keyword column falls back to keyword only', () => {
    assert.deepEqual(resolveExistsFields(noTextStr, true), ['c'])
  })

  test('exists fields: long-text column (no keyword index, no doc_values) uses its analyzed fields', () => {
    // the main keyword field is in neither the inverted index, the doc_values nor _field_names:
    // an exists on it silently matches nothing, so it must be left out entirely
    assert.deepEqual(resolveExistsFields(textOnlyStr, false), ['c.text_standard', 'c.text'])
    assert.deepEqual(resolveExistsFields({ ...textOnlyStr, 'x-capabilities': { ...textOnlyStr['x-capabilities'], text: false } }, false), ['c.text_standard'])
  })

  test('exists fields: an un-flagged long-text column also uses its exact case-insensitive field', () => {
    assert.deepEqual(resolveExistsFields({ key: 'c', type: 'string', 'x-capabilities': { index: false, values: false } }, false),
      ['c.text_standard', 'c.text', 'c.keyword_insensitive'])
    // flagged: `.keyword_insensitive` carries the same ignore_above limit, so it drops out
    assert.deepEqual(resolveExistsFields({ key: 'c', type: 'string', 'x-capabilities': { index: false, values: false } }, true),
      ['c.text_standard', 'c.text'])
  })

  test('exists fields: doc_values alone can answer existence', () => {
    // `values` still on: the main field keeps its doc_values, which ES reads for exists
    assert.deepEqual(resolveExistsFields({ key: 'c', type: 'string', 'x-capabilities': { index: false } }, false), ['c'])
    assert.deepEqual(resolveExistsFields({ key: 'n', type: 'number', 'x-capabilities': { index: false } }, false), ['n'])
  })

  test('exists fields: nothing indexed at all → empty, the caller must refuse the filter', () => {
    assert.deepEqual(resolveExistsFields({ ...textOnlyStr, 'x-capabilities': { index: false, values: false, insensitive: false, text: false, textStandard: false } }, false), [])
    // geometry-concept columns are mapped {keyword, index:false, doc_values:false} with no sub-field
    assert.deepEqual(resolveExistsFields({ key: 'g', type: 'string', 'x-refersTo': 'https://purl.org/geojson/vocab#geometry' }, false), [])
    assert.deepEqual(resolveExistsFields({ key: 'n', type: 'number', 'x-capabilities': { index: false, values: false } }, false), [])
  })

  test('range/prefix: un-flagged stays keyword (not uncertain); flagged routes/flags', () => {
    assert.deepEqual(resolveRangeOrPrefixField(plainStr, false), { field: 'c', uncertain: false })
    assert.deepEqual(resolveRangeOrPrefixField(wildcardStr, true), { field: 'c.wildcard', uncertain: false })
    assert.deepEqual(resolveRangeOrPrefixField(plainStr, true), { field: 'c', uncertain: true })
    assert.deepEqual(resolveRangeOrPrefixField(numberProp, true), { field: 'n', uncertain: false })
  })
})
