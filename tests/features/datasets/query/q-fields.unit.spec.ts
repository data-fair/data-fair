import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { Q_SEARCH_FIELDS_THRESHOLD, hasManyQSearchFields, getFilterableFields, buildQClauses } from '../../../../api/src/datasets/es/operations.ts'

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
  test('ignores boost-eligible columns (they are queried per-field, not via _search)', () => {
    // 30 plain strings = 60 inner fields => wide
    assert.equal(hasManyQSearchFields(stringFields(30)), true)
    // 30 columns all annotated as labels contribute 0 to the count (always per-field) => not wide
    const allLabels = Array.from({ length: 30 }, (_, i) => ({ key: 'l' + i, type: 'string', 'x-refersTo': 'http://www.w3.org/2000/01/rdf-schema#label' }))
    assert.equal(hasManyQSearchFields(allLabels), false)
  })
  test('tolerates a missing schema', () => {
    assert.equal(hasManyQSearchFields(undefined), false)
    assert.equal(hasManyQSearchFields(null), false)
  })
})

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

  test('catch-all: boost-eligible columns (label/description) are still listed per-field with their boost', () => {
    const ds = fakeDataset({
      schema: [
        ...wideSchema(),
        { key: 'label_col', type: 'string', 'x-refersTo': 'http://www.w3.org/2000/01/rdf-schema#label' },
        { key: 'desc_col', type: 'string', 'x-refersTo': 'http://schema.org/description' }
      ],
      _esCopyToSearch: true
    })
    const { qSearchFields, qStandardFields, copyToSearch } = getFilterableFields(ds, 'x', undefined)
    assert.equal(copyToSearch, true)
    // boost-eligible columns are listed per-field with their ^N suffix; _search covers everything else
    // (the catch-all entry is appended after the per-field loop)
    assert.deepEqual(qSearchFields, [
      'label_col.text^3', 'label_col.text_standard^3',
      'desc_col.text^2', 'desc_col.text_standard^2',
      '_search'
    ])
    assert.deepEqual(qStandardFields, [
      'label_col.text_standard^3',
      'desc_col.text_standard^2',
      '_search.text_standard'
    ])
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

test.describe('buildQClauses - catch-all clauses', () => {
  test('catch-all dataset: q targets _search; no separate _search_boosted clause', () => {
    const ds: any = fakeDataset({
      schema: [
        ...wideSchema(),
        { key: 'label_col', type: 'string', 'x-refersTo': 'http://www.w3.org/2000/01/rdf-schema#label' }
      ],
      _esCopyToSearch: true
    })
    const qBool: any = buildQClauses(ds, 'hello', undefined, undefined)
    const sqs = qBool.bool.should.filter((s: any) => s.simple_query_string).map((s: any) => s.simple_query_string.fields)
    // boost-eligible columns listed per-field with ^N suffix; catch-all `_search` appended after
    assert.ok(sqs.some((f: string[]) => JSON.stringify(f) === JSON.stringify(['label_col.text^3', 'label_col.text_standard^3', '_search'])))
    assert.ok(sqs.some((f: string[]) => JSON.stringify(f) === JSON.stringify(['label_col.text_standard^3', '_search.text_standard'])))
    // no `_search_boosted` field is emitted by the query layer any more
    assert.ok(!JSON.stringify(sqs).includes('_search_boosted'))
  })

  test('legacy narrow dataset: q targets per-field list, no _search', () => {
    const ds: any = fakeDataset({ schema: [{ key: 'a', type: 'string' }] })
    const qBool: any = buildQClauses(ds, 'hello', undefined, undefined)
    const fieldsLists = qBool.bool.should.filter((s: any) => s.simple_query_string).map((s: any) => s.simple_query_string.fields)
    assert.ok(fieldsLists.some((f: string[]) => f.includes('a.text')))
    assert.ok(!JSON.stringify(fieldsLists).includes('_search'))
  })
})
