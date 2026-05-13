import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { queryAdvice, shouldEmitHint, attachQueryHint } from '../../../api/src/misc/utils/query-advice.ts'

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
    assert.match(queryAdvice(fakeReq('/abc/lines', { count: 'false', select: '*' }, wide)), /errors\.queryAdviceSelect/) // select=* == all fields
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

  test('qFields rule: fires on a wide dataset searched with q and no q_fields', () => {
    const wide = { schema: Array.from({ length: 31 }, (_, i) => ({ key: 'f' + i, type: 'string' })) }
    const narrow = { schema: Array.from({ length: 5 }, (_, i) => ({ key: 'f' + i, type: 'string' })) }
    assert.match(queryAdvice(fakeReq('/abc/lines', { q: 'x' }, wide)), /errors\.queryAdviceQFields/)
    assert.match(queryAdvice(fakeReq('/abc/lines', { _c_q: 'x' }, wide)), /errors\.queryAdviceQFields/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { q: 'x', q_fields: 'f1,f2' }, wide)), /errors\.queryAdviceQFields/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', {}, wide)), /errors\.queryAdviceQFields/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { q: 'x' }, narrow)), /errors\.queryAdviceQFields/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { q: 'x' })), /errors\.queryAdviceQFields/)
  })
})

test.describe('shouldEmitHint', () => {
  test('false silences the hint regardless of duration', () => {
    assert.equal(shouldEmitHint('false', 0), false)
    assert.equal(shouldEmitHint('false', 99999), false)
  })
  test('true emits regardless of duration', () => {
    assert.equal(shouldEmitHint('true', 0), true)
    assert.equal(shouldEmitHint('true', 99999), true)
  })
  test('auto emits only when ES step duration exceeds the slow-request threshold', () => {
    assert.equal(shouldEmitHint('auto', 0), false)
    assert.equal(shouldEmitHint('auto', 1000), false) // strictly greater than 1000ms
    assert.equal(shouldEmitHint('auto', 1001), true)
  })
})

test.describe('attachQueryHint', () => {
  test('prepends a trimmed advice string when a rule fires and hint=true', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    const req = fakeReq('/abc/lines', { hint: 'true' }, wide)
    const out = attachQueryHint(req, 0, { total: 5, results: [] })
    assert.ok(typeof out.hint === 'string')
    assert.ok((out.hint as string).length > 0)
    assert.equal((out.hint as string)[0] !== ' ', true) // leading space stripped
    // hint must appear before existing fields so it lands first in the JSON output
    assert.equal(Object.keys(out)[0], 'hint')
  })
  test('does not attach when hint=false even with a slow query and matching rule', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    const req = fakeReq('/abc/lines', { hint: 'false' }, wide)
    const out = attachQueryHint(req, 99999, { total: 5 })
    assert.equal('hint' in out, false)
  })
  test('does not attach when hint=auto and the query was fast', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    const req = fakeReq('/abc/lines', {}, wide)
    const out = attachQueryHint(req, 500, { total: 5 })
    assert.equal('hint' in out, false)
  })
  test('attaches when hint=auto and the query crossed the slow threshold', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    const req = fakeReq('/abc/lines', {}, wide)
    const out = attachQueryHint(req, 1500, { total: 5 })
    assert.ok(typeof out.hint === 'string')
  })
  test('does not attach when no rule fires (even with hint=true)', () => {
    const req = fakeReq('/abc/lines', { hint: 'true', count: 'false', after: '["x"]' })
    const out = attachQueryHint(req, 99999, { total: 5 })
    assert.equal('hint' in out, false)
  })
  test('treats unknown hint values as auto', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    const req = fakeReq('/abc/lines', { hint: 'banana' }, wide)
    assert.equal('hint' in attachQueryHint(req, 500, { total: 5 }), false)
    assert.ok(typeof attachQueryHint(req, 1500, { total: 5 }).hint === 'string')
  })
})
