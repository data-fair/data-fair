import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, doAndWaitForFinalize } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

// A `terms` aggregation is document-scoped: on a multi-valued (separator) column it emits every
// value of every matching row, so `q` used to be unable to narrow the list — the sibling values
// of a matching row leaked into autocompletes and could even push the real matches past `size`.
const createDataset = async (ax: any) => {
  await ax.post('/api/v1/datasets/multival1', {
    isRest: true,
    title: 'multival1',
    schema: [{ key: 'tags', type: 'string', separator: ',' }, { key: 'label', type: 'string' }]
  })
  await ax.post('/api/v1/datasets/multival1/_bulk_lines', [
    { tags: 'cinéma,théâtre', label: 'a' },
    { tags: 'cinema,musique', label: 'b' },
    { tags: 'sport', label: 'c' },
    { tags: 'cinema d auteur,danse', label: 'd' }
  ])
  return await waitForFinalize(ax, 'multival1')
}

test.describe('values on multi-valued columns', () => {
  test.beforeEach(async () => { await clean() })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('q narrows to the matching values, not the matching rows', async () => {
    const ax = testUser1
    await createDataset(ax)

    // unfiltered: every value of the column, unchanged behaviour
    let res = await ax.get('/api/v1/datasets/multival1/values/tags')
    assert.deepEqual(res.data, ['cinema', 'cinema d auteur', 'cinéma', 'danse', 'musique', 'sport', 'théâtre'])

    // complete mode: prefix on the value itself. "danse"/"musique"/"théâtre" share a row with a
    // matching value but do not match themselves
    res = await ax.get('/api/v1/datasets/multival1/values/tags?q=cin&q_mode=complete')
    assert.deepEqual(res.data, ['cinema', 'cinema d auteur', 'cinéma'])

    // diacritics and case are folded, in both directions (order is relevance-based once q is set,
    // so the exact match leads — compare the sets)
    for (const q of ['cinéma', 'CINEMA', 'cinema']) {
      res = await ax.get(`/api/v1/datasets/multival1/values/tags?q=${encodeURIComponent(q)}&q_mode=complete`)
      assert.deepEqual([...res.data].sort(), ['cinema', 'cinema d auteur', 'cinéma'], `q=${q}`)
    }

    // a prefix that only ever appears mid-value matches nothing in complete mode
    res = await ax.get('/api/v1/datasets/multival1/values/tags?q=auteur&q_mode=complete')
    assert.deepEqual(res.data, [])

    // default mode (adapt) narrows too, with contains semantics
    res = await ax.get('/api/v1/datasets/multival1/values/tags?q=auteur')
    assert.deepEqual(res.data, ['cinema d auteur'])

    // explicit wildcards are honoured rather than escaped
    res = await ax.get('/api/v1/datasets/multival1/values/tags?q=cine*')
    assert.deepEqual(res.data, ['cinema', 'cinema d auteur', 'cinéma'])

    // real matches are no longer pushed out of the page by the sibling values
    res = await ax.get('/api/v1/datasets/multival1/values/tags?q=cin&q_mode=complete&size=3')
    assert.deepEqual(res.data, ['cinema', 'cinema d auteur', 'cinéma'])
  })

  test('values-labels narrows the same way', async () => {
    const ax = testUser1
    const dataset = await createDataset(ax)

    let res = await ax.get('/api/v1/datasets/multival1/values-labels/tags?q=cin&q_mode=complete')
    assert.deepEqual(res.data.map((v: any) => v.value), ['cinema', 'cinema d auteur', 'cinéma'])

    // labels still apply on top of the narrowed list
    const schema = dataset.schema.filter((f: any) => !f['x-calculated'])
    schema.find((f: any) => f.key === 'tags')['x-labels'] = { cinema: 'Cinéma !' }
    await ax.patch('/api/v1/datasets/multival1', { schema })
    res = await ax.get('/api/v1/datasets/multival1/values-labels/tags?q=cin&q_mode=complete')
    assert.deepEqual(res.data[0], { value: 'cinema', label: 'Cinéma !' })
  })

  test('single-valued columns and non-literal queries keep their analysed matching', async () => {
    const ax = testUser1
    await createDataset(ax)

    // single-valued column: doc and value are 1:1, nothing to narrow, stemming untouched
    let res = await ax.get('/api/v1/datasets/multival1/values/label?q=a&q_mode=complete')
    assert.deepEqual(res.data, ['a'])

    // a query using simple_query_string operators is not a literal reading of a value:
    // narrowing is declined rather than emptying the list
    res = await ax.get('/api/v1/datasets/multival1/values/tags?q=' + encodeURIComponent('cinema | sport'))
    assert.ok(res.data.includes('sport'), 'the OR query should still match sport')
    assert.ok(res.data.includes('cinema'))
  })

  test('pathological queries stay bounded', async () => {
    const ax = testUser1
    await createDataset(ax)

    // The `include` pattern is compiled into an automaton inside ES, and determinization there is
    // uninterruptible: an unbounded pattern is a memory-exhaustion vector on a public read
    // endpoint, not merely a slow query. An early draft of this narrowing joined words with
    // lucene's `&` intersection and a 100-word query ate a whole node's heap.
    const queries = [
      'x'.repeat(200), // at the length cap
      'x'.repeat(500), // past it, narrowing declined
      Array.from({ length: 100 }, (_, i) => `word${i}`).join(' '), // used to be a 100-way intersection
      'a*b*c*', // at the wildcard cap
      'a*b*'.repeat(50) // past it, narrowing declined
    ]
    for (const q of queries) {
      const res = await ax.get('/api/v1/datasets/multival1/values/tags', { params: { q } })
      assert.equal(res.status, 200, `q of ${q.length} chars should answer`)
      assert.ok(Array.isArray(res.data))
    }
  })

  test('a filter on the listed column narrows the values it lists', async () => {
    const ax = testUser1
    await createDataset(ax)

    // the reported case: values-labels asked with an _in filter must answer with the labels of
    // the values named, not with everything else the matching rows happen to carry
    let res = await ax.get('/api/v1/datasets/multival1/values-labels/tags?tags_in=cinema')
    assert.deepEqual(res.data.map((v: any) => v.value), ['cinema'])
    res = await ax.get('/api/v1/datasets/multival1/values-labels/tags?tags_in=cinema,sport')
    assert.deepEqual(res.data.map((v: any) => v.value), ['cinema', 'sport'])
    res = await ax.get('/api/v1/datasets/multival1/values/tags?tags_eq=cinema')
    assert.deepEqual(res.data, ['cinema'])

    // the predicate filters narrow the same way
    res = await ax.get('/api/v1/datasets/multival1/values/tags?tags_starts=cin')
    assert.deepEqual(res.data, ['cinema', 'cinema d auteur', 'cinéma'])
    res = await ax.get('/api/v1/datasets/multival1/values/tags?tags_search=auteur')
    assert.deepEqual(res.data, ['cinema d auteur'])

    // a filter on ANOTHER column selects rows; the value list must stay whole
    res = await ax.get('/api/v1/datasets/multival1/values/tags?label_eq=a')
    assert.deepEqual(res.data, ['cinéma', 'théâtre'])

    // a value the caller named is not narrowed away by a looser predicate: row b carries both
    // "cinema" and "musique" and survives `_starts=mus`, so both named values are listed even
    // though only one of them starts with "mus"
    res = await ax.get('/api/v1/datasets/multival1/values/tags?tags_in=cinema,musique&tags_starts=mus')
    assert.deepEqual(res.data, ['cinema', 'musique'])

    // the filters still select rows as they always did — `_starts=spo` drops every row holding
    // "cinema", so no include can bring it back
    res = await ax.get('/api/v1/datasets/multival1/values/tags?tags_in=cinema,sport&tags_starts=spo')
    assert.deepEqual(res.data, ['sport'])
  })

  test('the labels-restricted shortcut narrows identically', async () => {
    const ax = testUser1
    const dataset = await createDataset(ax)

    // this path answers from the schema without touching the index, so it needs its own narrowing
    const schema = dataset.schema.filter((f: any) => !f['x-calculated'])
    const tags = schema.find((f: any) => f.key === 'tags')
    tags['x-labels'] = { cinema: 'Cinéma', sport: 'Sport', danse: 'Danse' }
    tags['x-labelsRestricted'] = true
    await ax.patch('/api/v1/datasets/multival1', { schema })

    let res = await ax.get('/api/v1/datasets/multival1/values-labels/tags')
    assert.deepEqual(res.data.map((v: any) => v.value), ['cinema', 'sport', 'danse'])
    res = await ax.get('/api/v1/datasets/multival1/values-labels/tags?tags_in=cinema,danse')
    assert.deepEqual(res.data, [{ value: 'cinema', label: 'Cinéma' }, { value: 'danse', label: 'Danse' }])
  })

  test('values_agg keeps faceting over matching rows', async () => {
    const ax = testUser1
    await createDataset(ax)

    // values_agg's q is dataset-wide (no q_fields), so its buckets are a facet of the matching
    // rows — the sibling values belong there and must NOT be narrowed away
    const res = await ax.get('/api/v1/datasets/multival1/values_agg?field=tags&q=cin&q_mode=complete')
    const values = res.data.aggs.map((a: any) => a.value)
    assert.ok(values.includes('théâtre'), 'a facet keeps the other values of the matching rows')
    assert.ok(values.includes('cinéma'))
  })

  test('narrowing follows the wildcard capability in complete mode', async () => {
    const ax = testUser1
    const dataset = await createDataset(ax)

    // with the wildcard capability the doc-level query also matches *q*, so the value-level
    // narrowing must widen to contains or it would drop rows the query legitimately matched
    const schema = dataset.schema.filter((f: any) => !f['x-calculated'])
    schema.find((f: any) => f.key === 'tags')['x-capabilities'] = { wildcard: true }
    await doAndWaitForFinalize(ax, 'multival1', () => ax.patch('/api/v1/datasets/multival1', { schema }))

    const res = await ax.get('/api/v1/datasets/multival1/values/tags?q=auteur&q_mode=complete')
    assert.deepEqual(res.data, ['cinema d auteur'])
  })
})
