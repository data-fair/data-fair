import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { Q_SEARCH_FIELDS_THRESHOLD, hasManyQSearchFields, getFilterableFields, buildQClauses } from '../../../../api/src/datasets/es/operations.ts'

// every column materializes exactly ONE analyzed inner field (spec §2) -> counts as 1. A plain
// string column with no `language` gets .text_standard; with a `language` it gets .text instead.
const stringFields = (n: number) => Array.from({ length: n }, (_, i) => ({ key: 's' + i, type: 'string' }))
// an integer (or date) column produces only a .text_standard inner field -> counts as 1
const intFields = (n: number) => Array.from({ length: n }, (_, i) => ({ key: 'i' + i, type: 'integer' }))
const boolFields = (n: number) => Array.from({ length: n }, (_, i) => ({ key: 'b' + i, type: 'boolean' }))

test.describe('hasManyQSearchFields', () => {
  test('threshold is 15', () => {
    assert.equal(Q_SEARCH_FIELDS_THRESHOLD, 15)
  })
  test('counts the single analyzed inner field of each column', () => {
    // string columns have one -> 15 columns == 15 inner fields (not over), 16 == 16 (over).
    // The threshold was halved 30 -> 15 alongside single-field emission, so this string-column
    // decision boundary is exactly the pre-change one.
    assert.equal(hasManyQSearchFields(stringFields(15)), false)
    assert.equal(hasManyQSearchFields(stringFields(16)), true)
    // integer/date columns also have exactly one (.text_standard) -> same boundary now. They only
    // ever contributed one field, so halving the threshold does move THEIR boundary (30 -> 15) —
    // a deliberate, accepted side effect: a wide scalar dataset getting the catch-all is cheap.
    assert.equal(hasManyQSearchFields(intFields(15)), false)
    assert.equal(hasManyQSearchFields(intFields(16)), true)
  })
  test('ignores fields with no text inner field, and _id', () => {
    assert.equal(hasManyQSearchFields([...stringFields(16), ...boolFields(50), { key: '_id', type: 'string' }]), true)
    assert.equal(hasManyQSearchFields([...stringFields(10), ...boolFields(50)]), false) // 10 inner fields
  })
  test('ignores boost-eligible columns (they are queried per-field, not via _search)', () => {
    // 30 plain strings = 30 inner fields => wide
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
  test('full legacy: narrow dataset lists the effective analyzed field of every column', () => {
    const ds = fakeDataset({ schema: [{ key: 'a', type: 'string' }, { key: 'b', type: 'string' }] })
    const { qSearchFields, qStandardFields, copyToSearch, reduced } = getFilterableFields(ds, 'x', undefined)
    assert.equal(copyToSearch, false)
    assert.equal(reduced, false)
    // keyword main types ('a', 'b') are omitted: each column has an analyzed inner field which
    // already covers `q` matching, so the keyword main entry would be redundant. These columns
    // carry no `language`, so their single analyzed field is .text_standard.
    assert.deepEqual(qSearchFields, ['a.text_standard', 'b.text_standard'])
    assert.deepEqual(qStandardFields, ['a.text_standard', 'b.text_standard'])
  })

  test('a language column routes to .text, a language-less one to .text_standard', () => {
    const ds = fakeDataset({ schema: [{ key: 'fr1', type: 'string', language: 'fr' }, { key: 'std1', type: 'string' }] })
    const { qSearchFields, esFields } = getFilterableFields(ds, 'x', undefined)
    assert.deepEqual(qSearchFields, ['fr1.text', 'std1.text_standard'])
    // the esFields allowlist (which validates explicit `qs=` references) exposes only the
    // materialized name for each column
    assert.ok(esFields.includes('fr1.text'))
    assert.ok(!esFields.includes('fr1.text_standard'))
    assert.ok(esFields.includes('std1.text_standard'))
    assert.ok(!esFields.includes('std1.text'))
  })

  test('pure-keyword column (text + textStandard disabled) is searched through its insensitive twin', () => {
    const ds = fakeDataset({
      schema: [
        { key: 'a', type: 'string' },
        { key: 'tag', type: 'string', 'x-capabilities': { text: false, textStandard: false } }
      ]
    })
    const { qSearchFields, qStandardFields } = getFilterableFields(ds, 'x', undefined)
    // `tag` has no analyzed inner field, so the keyword view is the only way to search it. We use
    // `.keyword_insensitive` rather than the main type so that `q` ignores case and diacritics.
    assert.deepEqual(qSearchFields, ['a.text_standard', 'tag.keyword_insensitive'])
    assert.deepEqual(qStandardFields, ['a.text_standard'])
  })

  test('pure-keyword column without the insensitive capability falls back to the keyword main type', () => {
    const ds = fakeDataset({
      schema: [
        { key: 'tag', type: 'string', 'x-capabilities': { text: false, textStandard: false, insensitive: false } }
      ]
    })
    const { qSearchFields } = getFilterableFields(ds, 'x', undefined)
    assert.deepEqual(qSearchFields, ['tag'])
  })

  test('wildcard column keeps its .wildcard target even without analyzed inner fields', () => {
    // `.wildcard` is mapped from the wildcard capability alone, independently of text analysis,
    // so the query fanout must expose it for text-disabled columns too (typically codes).
    const ds = fakeDataset({
      schema: [
        { key: 'code', type: 'string', 'x-capabilities': { text: false, textStandard: false, wildcard: true } }
      ]
    })
    const { wildcardFields, qWildcardFields, qSearchFields } = getFilterableFields(ds, 'x', undefined)
    assert.deepEqual(wildcardFields, ['code.wildcard'])
    assert.deepEqual(qWildcardFields, ['code.wildcard'])
    assert.deepEqual(qSearchFields, ['code.keyword_insensitive'])
  })

  test('wildcard fanout still requires the column to be a q field', () => {
    const ds = fakeDataset({
      schema: [
        { key: 'code', type: 'string', 'x-capabilities': { text: false, textStandard: false, wildcard: true } },
        { key: 'other', type: 'string', 'x-capabilities': { wildcard: true } }
      ]
    })
    const { wildcardFields, qWildcardFields } = getFilterableFields(ds, 'x', ['other'])
    // wildcardFields is the full filterable set, qWildcardFields is restricted to q_fields
    assert.deepEqual(wildcardFields, ['code.wildcard', 'other.wildcard'])
    assert.deepEqual(qWildcardFields, ['other.wildcard'])
  })

  test('non-string pure-keyword columns are unaffected (no insensitive inner field exists)', () => {
    // .keyword_insensitive is only generated for string columns; a date/integer column with
    // textStandard disabled has no keyword view at all and stays out of `q`.
    const ds = fakeDataset({
      schema: [
        { key: 'n', type: 'integer', 'x-capabilities': { textStandard: false } },
        { key: 'd', type: 'string', format: 'date', 'x-capabilities': { textStandard: false } }
      ]
    })
    const { qSearchFields } = getFilterableFields(ds, 'x', undefined)
    assert.deepEqual(qSearchFields, [])
  })

  test('catch-all: _esCopyToSearch dataset collapses qSearchFields to just _search (analyzed views and keyword mains both gone)', () => {
    const ds = fakeDataset({ schema: wideSchema(), _esCopyToSearch: true })
    const { qSearchFields, qStandardFields, copyToSearch, reduced } = getFilterableFields(ds, 'x', undefined)
    assert.equal(copyToSearch, true)
    assert.equal(reduced, false)
    // Every column has analyzed inner fields, so no keyword main is added; analyzed views all
    // collapse into `_search` via copy_to. qSearchFields is constant-size regardless of width.
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
    // boost-eligible columns contribute their single analyzed inner field with the ^N suffix; the
    // catch-all `_search` entry is appended last. No keyword main types: every column has an
    // analyzed inner field.
    assert.deepEqual(qSearchFields, [
      'label_col.text_standard^3',
      'desc_col.text_standard^2',
      '_search'
    ])
    // the catch-all `_search` field itself keeps its own .text_standard subfield (spec §4:
    // alignment of `_search` is deferred), so qStandardFields is not a copy of qSearchFields here
    assert.deepEqual(qStandardFields, [
      'label_col.text_standard^3',
      'desc_col.text_standard^2',
      '_search.text_standard'
    ])
  })

  test('wide dataset, no catch-all yet: each column contributes exactly one analyzed field, whichever analyzer it uses', () => {
    // The former "reduced" dedup (drop .text_standard when .text covers the same column) dissolved
    // with single-field emission — there is no analyzer duplicate left to drop. What this pins now
    // is that mixed regimes coexist: language columns route to .text, scalars to .text_standard.
    const ds = fakeDataset({
      schema: [
        ...Array.from({ length: 20 }, (_, i) => ({ key: 's' + i, type: 'string', language: 'fr' })),
        ...Array.from({ length: 5 }, (_, i) => ({ key: 'i' + i, type: 'integer' }))
      ],
      _esCopyToSearch: false
    })
    const { qSearchFields, qStandardFields, copyToSearch, reduced } = getFilterableFields(ds, 'x', undefined)
    assert.equal(copyToSearch, false)
    assert.equal(reduced, true)
    // language string columns: only .text. The keyword main type is omitted (the analyzed view
    // covers it) and .text_standard is never materialized on these columns at all.
    assert.ok(!qSearchFields.includes('s0'))
    assert.ok(qSearchFields.includes('s0.text'))
    assert.ok(!qSearchFields.includes('s0.text_standard'))
    // integer columns: .text_standard is their analyzed field, so it stays in qSearchFields —
    // removing it would eject the column from `q` entirely.
    assert.ok(qSearchFields.includes('i0.text_standard'))
    // qStandardFields drives q_mode=complete's prefix query: language columns target their
    // unstemmed `.prefix` companion (task 8), scalars keep their already-unstemmed .text_standard
    assert.ok(!qStandardFields.includes('s0.text'))
    assert.ok(qStandardFields.includes('s0.prefix'))
    assert.ok(qStandardFields.includes('i0.text_standard'))
    // catch-all is not in play yet (no reindex)
    assert.ok(!qSearchFields.includes('_search'))
  })

  test('q_fields given on a wide+copyTo dataset still uses the explicit per-field list, not _search', () => {
    const ds = fakeDataset({ schema: wideSchema(), _esCopyToSearch: true })
    const { qSearchFields, copyToSearch } = getFilterableFields(ds, 'x', ['f3'])
    assert.equal(copyToSearch, false)
    // f3 has an analyzed inner field, so its keyword main is omitted from qSearchFields
    assert.deepEqual(qSearchFields, ['f3.text_standard'])
  })

  test('searchFields (used for the ?qs= query_string) is unchanged in catch-all mode', () => {
    const ds = fakeDataset({ schema: wideSchema(), _esCopyToSearch: true })
    const { searchFields } = getFilterableFields(ds, 'x', undefined)
    // searchFields still carries the keyword main type for the raw `qs=` path
    assert.ok(searchFields.includes('f0'))
    assert.ok(searchFields.includes('f0.text_standard'))
    assert.ok(!searchFields.includes('_search'))
  })
})

test.describe('buildQClauses - catch-all clauses', () => {
  test('catch-all dataset: q targets the boost-eligible per-field entries plus _search; no separate _search_boosted clause', () => {
    const ds: any = fakeDataset({
      schema: [
        ...wideSchema(),
        { key: 'label_col', type: 'string', 'x-refersTo': 'http://www.w3.org/2000/01/rdf-schema#label' }
      ],
      _esCopyToSearch: true
    })
    const qBool: any = buildQClauses(ds, 'hello', undefined, undefined)
    const sqs = qBool.bool.should.filter((s: any) => s.simple_query_string).map((s: any) => s.simple_query_string.fields)
    // no keyword main types contribute — every column has analyzed inner fields covered by `_search`
    const expectedQSearchFields = [
      'label_col.text_standard^3',
      '_search'
    ]
    assert.ok(sqs.some((f: string[]) => JSON.stringify(f) === JSON.stringify(expectedQSearchFields)))
    // qStandardFields (clause B in default mode) only carries analyzed-text views
    assert.ok(sqs.some((f: string[]) => JSON.stringify(f) === JSON.stringify(['label_col.text_standard^3', '_search.text_standard'])))
    // no `_search_boosted` field is emitted by the query layer any more
    assert.ok(!JSON.stringify(sqs).includes('_search_boosted'))
  })

  test('legacy narrow dataset: q targets per-field list, no _search', () => {
    const ds: any = fakeDataset({ schema: [{ key: 'a', type: 'string' }] })
    const qBool: any = buildQClauses(ds, 'hello', undefined, undefined)
    const fieldsLists = qBool.bool.should.filter((s: any) => s.simple_query_string).map((s: any) => s.simple_query_string.fields)
    assert.ok(fieldsLists.some((f: string[]) => f.includes('a.text_standard')))
    assert.ok(!JSON.stringify(fieldsLists).includes('_search'))
  })
})
