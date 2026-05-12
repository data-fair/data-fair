import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { Q_SEARCH_FIELDS_THRESHOLD, hasManyQSearchFields } from '../../../../api/src/datasets/es/commons.js'

// a string column produces both a .text and a .text_standard inner field -> counts as 2
const stringFields = (n: number) => Array.from({ length: n }, (_, i) => ({ key: 's' + i, type: 'string' }))
// an integer (or date) column produces only a .text_standard inner field -> counts as 1
const intFields = (n: number) => Array.from({ length: n }, (_, i) => ({ key: 'i' + i, type: 'integer' }))
const boolFields = (n: number) => Array.from({ length: n }, (_, i) => ({ key: 'b' + i, type: 'boolean' }))

test.describe('hasManyQSearchFields', () => {
  test('threshold is 30', () => {
    assert.equal(Q_SEARCH_FIELDS_THRESHOLD, 30)
  })
  test('counts .text and .text_standard separately', () => {
    // string columns have both -> 15 columns == 30 inner fields (not over), 16 == 32 (over)
    assert.equal(hasManyQSearchFields(stringFields(15)), false)
    assert.equal(hasManyQSearchFields(stringFields(16)), true)
    // integer/date columns have only .text_standard -> 30 columns == 30 (not over), 31 == 31 (over)
    assert.equal(hasManyQSearchFields(intFields(30)), false)
    assert.equal(hasManyQSearchFields(intFields(31)), true)
  })
  test('ignores fields with no text inner field, and _id', () => {
    assert.equal(hasManyQSearchFields([...stringFields(16), ...boolFields(50), { key: '_id', type: 'string' }]), true)
    assert.equal(hasManyQSearchFields([...stringFields(10), ...boolFields(50)]), false) // 20 inner fields
  })
  test('tolerates a missing schema', () => {
    assert.equal(hasManyQSearchFields(undefined), false)
    assert.equal(hasManyQSearchFields(null), false)
  })
})

import { getFilterableFields, prepareQuery } from '../../../../api/src/datasets/es/commons.js'

// getFilterableFields is memoized on `${id}:${finalizedAt}:${!!hasQ}:${qFields}` — give each
// assertion a unique id so cases never collide.
let seq = 0
const fakeDataset = (over: any = {}) => ({ id: 'fd' + (seq++), finalizedAt: '2026-01-01', schema: [], ...over })
const wideSchema = (n = 32) => Array.from({ length: n }, (_, i) => ({ key: 'f' + i, type: 'string' }))

test.describe('getFilterableFields - regimes', () => {
  test('full legacy: narrow dataset lists every per-field variant', () => {
    const ds = fakeDataset({ schema: [{ key: 'a', type: 'string' }, { key: 'b', type: 'string' }] })
    const { qSearchFields, qStandardFields, copyToSearch, reduced } = getFilterableFields(ds, 'x', undefined)
    assert.equal(copyToSearch, false)
    assert.equal(reduced, false)
    assert.deepEqual(qSearchFields, ['a', 'a.text', 'a.text_standard', 'b', 'b.text', 'b.text_standard'])
    assert.deepEqual(qStandardFields, ['a.text_standard', 'b.text_standard'])
  })

  test('catch-all: _esCopyToSearch dataset collapses to the _search fields', () => {
    const ds = fakeDataset({ schema: wideSchema(), _esCopyToSearch: true })
    const { qSearchFields, qStandardFields, copyToSearch, reduced } = getFilterableFields(ds, 'x', undefined)
    assert.equal(copyToSearch, true)
    assert.equal(reduced, false)
    assert.deepEqual(qSearchFields, ['_search'])
    assert.deepEqual(qStandardFields, ['_search.text_standard'])
  })

  test('reduced: wide dataset not yet reindexed drops .text_standard from qSearchFields but keeps qStandardFields', () => {
    const ds = fakeDataset({ schema: wideSchema(33), _esCopyToSearch: false })
    const { qSearchFields, qStandardFields, copyToSearch, reduced } = getFilterableFields(ds, 'x', undefined)
    assert.equal(copyToSearch, false)
    assert.equal(reduced, true)
    assert.ok(qSearchFields.includes('f0.text'))
    assert.ok(!qSearchFields.some((f: string) => f.endsWith('.text_standard')))
    assert.ok(qStandardFields.includes('f0.text_standard')) // still populated for complete-mode prefix
    assert.ok(!qSearchFields.includes('_search'))
  })

  test('q_fields given on a wide+copyTo dataset still uses the explicit per-field list, not _search', () => {
    const ds = fakeDataset({ schema: wideSchema(), _esCopyToSearch: true })
    const { qSearchFields, copyToSearch } = getFilterableFields(ds, 'x', ['f3'])
    assert.equal(copyToSearch, false)
    assert.deepEqual(qSearchFields, ['f3', 'f3.text', 'f3.text_standard'])
  })

  test('searchFields (used for the ?qs= query_string) is unchanged in catch-all mode', () => {
    const ds = fakeDataset({ schema: wideSchema(), _esCopyToSearch: true })
    const { searchFields } = getFilterableFields(ds, 'x', undefined)
    assert.ok(searchFields.includes('f0.text'))
    assert.ok(!searchFields.includes('_search'))
  })
})

test.describe('prepareQuery - catch-all clauses', () => {
  const baseQuery = { size: '10' }
  test('catch-all dataset: q targets _search and adds a _search_boosted clause', () => {
    const ds: any = fakeDataset({ schema: wideSchema(), _esCopyToSearch: true })
    const esQuery: any = prepareQuery(ds, { ...baseQuery, q: 'hello' })
    const shoulds = esQuery.query.bool.must.flatMap((m: any) => m.bool?.should ?? [])
    const sqs = shoulds.filter((s: any) => s.simple_query_string).map((s: any) => s.simple_query_string.fields)
    assert.ok(sqs.some((f: string[]) => JSON.stringify(f) === JSON.stringify(['_search'])))
    assert.ok(sqs.some((f: string[]) => JSON.stringify(f) === JSON.stringify(['_search.text_standard'])))
    assert.ok(sqs.some((f: string[]) => JSON.stringify(f) === JSON.stringify(['_search_boosted^3', '_search_boosted.text_standard^3'])))
  })

  test('legacy narrow dataset: q targets per-field list, no _search_boosted', () => {
    const ds: any = fakeDataset({ schema: [{ key: 'a', type: 'string' }] })
    const esQuery: any = prepareQuery(ds, { ...baseQuery, q: 'hello' })
    const shoulds = esQuery.query.bool.must.flatMap((m: any) => m.bool?.should ?? [])
    const fieldsLists = shoulds.filter((s: any) => s.simple_query_string).map((s: any) => s.simple_query_string.fields)
    assert.ok(fieldsLists.some((f: string[]) => f.includes('a.text')))
    assert.ok(!JSON.stringify(fieldsLists).includes('_search'))
  })
})
