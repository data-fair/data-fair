import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, sendDataset } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
// _diagnose requires admin mode (superadmin only)
const adminUser = await axiosAuth('test_superadmin@test.com', undefined, true)

test.describe('search - wide dataset (_search catch-all)', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('a 33-column dataset gets the _search catch-all field and q works through it', async () => {
    const ax = testUser1
    let dataset = await sendDataset('datasets/wide-dataset.csv', ax)

    // index mapping carries the catch-all fields
    const diagnose = (await adminUser.get(`/api/v1/datasets/${dataset.id}/_diagnose`)).data
    const aliasedIndex = diagnose.esInfos.index
    const props = aliasedIndex.definition.mappings.properties
    assert.ok(props._search, 'index should have a _search field')
    assert.ok(props._search_boosted, 'index should have a _search_boosted field')
    // ES normalizes copy_to to an array even when a single string was specified
    assert.deepEqual(props.col1.copy_to, ['_search'])

    // q matches a value in an arbitrary column
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'xyzzy-unique-token' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].col0, 'Globex Industries')

    // q matches a token inside a >200-char cell (the ignore_above x copy_to verification)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'exercitation' } })
    assert.equal(res.data.total, 1, 'a word inside a >200-char cell must be searchable via _search (ignore_above must not block copy_to)')
    assert.equal(res.data.results[0].col0, 'Initech LLC')

    // mark col0 as a label column and re-finalize — the index is rebuilt with col0 copying into
    // _search_boosted as well; the catch-all path still returns correct results afterwards
    dataset.schema.find((f: any) => f.key === 'col0')['x-refersTo'] = 'http://www.w3.org/2000/01/rdf-schema#label'
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: dataset.schema })
    dataset = await waitForFinalize(ax, dataset.id)
    const diagnose2 = (await adminUser.get(`/api/v1/datasets/${dataset.id}/_diagnose`)).data
    const props2 = diagnose2.esInfos.index.definition.mappings.properties
    assert.deepEqual(props2.col0.copy_to, ['_search', '_search_boosted'])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'Globex' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].col0, 'Globex Industries')
  })

  test('q_fields still restricts to the named columns on a wide dataset', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/wide-dataset.csv', ax)
    // 'xyzzy-unique-token' lives in col21; searching it scoped to col0 must return nothing
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'xyzzy-unique-token', q_fields: 'col0' } })
    assert.equal(res.data.total, 0)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'xyzzy-unique-token', q_fields: 'col21' } })
    assert.equal(res.data.total, 1)
  })
})
