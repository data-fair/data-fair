import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { queryAdvice } from '../../../api/src/misc/utils/query-advice.ts'

// minimal fake of the bits of an express Request the helper reads.
// `__` echoes the key so assertions can match on key names instead of translated text.
const fakeReq = (path: string, query: Record<string, any> = {}, dataset?: any) => ({
  path,
  query,
  dataset,
  __: (key: string) => key
} as any)

test.describe('queryAdvice', () => {
  test('empty string when no rule applies', () => {
    assert.equal(queryAdvice(fakeReq('/abc/lines', { count: 'false' })), '')
    assert.equal(queryAdvice(fakeReq('/abc/lines', { after: '["x"]' })), '')
    assert.equal(queryAdvice(fakeReq('/abc/lines', { count: 'estimate' })), '')
    assert.equal(queryAdvice(fakeReq('/abc/safe-schema')), '')
  })

  test('count rule: fires on a /lines request that asks for an exact count', () => {
    const out = queryAdvice(fakeReq('/abc/lines', {}))
    assert.match(out, /errors\.queryAdviceIntro/)
    assert.match(out, /errors\.queryAdviceCount/)
  })

  test('count rule: also fires on the ODS records path', () => {
    assert.match(queryAdvice(fakeReq('/v2.1/catalog/datasets/abc/records', {})), /errors\.queryAdviceCount/)
  })

  test('count rule: does not fire outside /lines or /records', () => {
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/values_agg', { field: 'a' })), /errors\.queryAdviceCount/)
  })

  test('deepPagination rule: deep native page or ODS offset fires, shallow does not', () => {
    assert.match(queryAdvice(fakeReq('/abc/lines', { count: 'false', page: '100' })), /errors\.queryAdviceDeepPagination/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false', page: '99' })), /errors\.queryAdviceDeepPagination/)
    assert.match(queryAdvice(fakeReq('/v2.1/catalog/datasets/abc/records', { offset: '1000' })), /errors\.queryAdviceDeepPagination/)
    assert.doesNotMatch(queryAdvice(fakeReq('/v2.1/catalog/datasets/abc/records', { offset: '999' })), /errors\.queryAdviceDeepPagination/)
  })

  test('aggSize rule: agg_size >= 100 fires', () => {
    assert.match(queryAdvice(fakeReq('/abc/values_agg', { field: 'a', agg_size: '100' })), /errors\.queryAdviceAggSize/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/values_agg', { field: 'a', agg_size: '50' })), /errors\.queryAdviceAggSize/)
  })

  test('aggSize rule: a multi-level field grouping fires even with a small agg_size', () => {
    assert.match(queryAdvice(fakeReq('/abc/values_agg', { field: 'a;b', agg_size: '10' })), /errors\.queryAdviceAggSize/)
  })

  test('size rule: size >= 1000 fires', () => {
    assert.match(queryAdvice(fakeReq('/abc/lines', { count: 'false', size: '1000' })), /errors\.queryAdviceSize/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false', size: '999' })), /errors\.queryAdviceSize/)
  })

  test('select rule: fires only when the dataset is known, wide, and no select param', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    const narrow = { schema: Array.from({ length: 5 }, (_, i) => ({ key: 'f' + i })) }
    assert.match(queryAdvice(fakeReq('/abc/lines', { count: 'false' }, wide)), /errors\.queryAdviceSelect/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false', select: 'f1,f2' }, wide)), /errors\.queryAdviceSelect/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false' }, narrow)), /errors\.queryAdviceSelect/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false' })), /errors\.queryAdviceSelect/)
  })

  test('multiple rules combine, count first', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    const out = queryAdvice(fakeReq('/abc/lines', { page: '500', size: '2000' }, wide))
    assert.match(out, /errors\.queryAdviceCount/)
    assert.match(out, /errors\.queryAdviceDeepPagination/)
    assert.match(out, /errors\.queryAdviceSize/)
    assert.match(out, /errors\.queryAdviceSelect/)
    assert.ok(out.indexOf('errors.queryAdviceCount') < out.indexOf('errors.queryAdviceDeepPagination'))
  })
})
