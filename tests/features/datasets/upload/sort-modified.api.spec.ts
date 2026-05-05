import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { nanoid } from 'nanoid'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('Unified _modified sort', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('orders metadata-only, REST, and DCAT-modified datasets correctly', async () => {
    const ax = testUser1
    const tag = nanoid()

    // Create REST dataset first and populate it (dataUpdatedAt set early)
    const restRes = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: `rest-dataset ${tag}`,
      schema: [{ key: 'str1', type: 'string' }]
    })
    assert.equal(restRes.status, 201)
    const restId = restRes.data.id
    await ax.post(`/api/v1/datasets/${restId}/_bulk_lines`, [{ str1: 'hello' }])
    await waitForFinalize(ax, restId)

    // Small delay so the meta-only dataset has a strictly newer updatedAt
    await new Promise(resolve => setTimeout(resolve, 50))

    // Create a metadata-only dataset AFTER the REST one — only updatedAt is set,
    // and it is newer than the REST dataset's dataUpdatedAt. This is the bug
    // scenario: with the old sort on dataUpdatedAt, this dataset would land at
    // the wrong end. With _modified, it must come BEFORE the REST one.
    const metaRes = await ax.post('/api/v1/datasets', {
      isMetaOnly: true,
      title: `meta-only ${tag}`
    })
    assert.equal(metaRes.status, 201)
    const metaId = metaRes.data.id

    // Create a metadata-only dataset with explicit DCAT future modified date
    const dcatRes = await ax.post('/api/v1/datasets', {
      isMetaOnly: true,
      title: `dcat-future ${tag}`,
      modified: '2099-01-01'
    })
    assert.equal(dcatRes.status, 201)
    const dcatId = dcatRes.data.id

    // List datasets sorted by -modified and filtered by unique tag
    const listRes = await ax.get('/api/v1/datasets', {
      params: { sort: '-modified', q: tag, size: 10 }
    })
    assert.equal(listRes.status, 200)

    const results = listRes.data.results
    const ourResults = results.filter((d: any) => [restId, metaId, dcatId].includes(d.id))
    const ourIds = ourResults.map((d: any) => d.id)

    // Expected order: dcat (2099) > meta (newest updatedAt) > rest (older dataUpdatedAt)
    assert.deepEqual(ourIds, [dcatId, metaId, restId],
      `sort=-modified should yield [dcat, meta, rest] but got ${JSON.stringify(ourIds)}`)
  })

  test('_modified is never returned by the API', async () => {
    const ax = testUser1
    const tag = nanoid()

    // Create a metadata-only dataset
    const res = await ax.post('/api/v1/datasets', {
      isMetaOnly: true,
      title: `invisibility-test ${tag}`
    })
    assert.equal(res.status, 201)
    const datasetId = res.data.id

    // Single GET: _modified must not appear in the response
    const singleRes = await ax.get(`/api/v1/datasets/${datasetId}`)
    assert.equal(singleRes.status, 200)
    assert.equal(singleRes.data._modified, undefined, '_modified should not be present in single GET response')

    // List GET: no result should contain _modified
    const listRes = await ax.get('/api/v1/datasets', {
      params: { q: tag, size: 10 }
    })
    assert.equal(listRes.status, 200)
    for (const dataset of listRes.data.results) {
      assert.equal(dataset._modified, undefined, `_modified should not be present in list GET response for dataset ${dataset.id}`)
    }
  })

  test('rejects _modified on POST and PATCH', async () => {
    const ax = testUser1
    const tag = nanoid()

    // POST with _modified should be rejected by schema validation
    let postRejected = false
    try {
      await ax.post('/api/v1/datasets', {
        isMetaOnly: true,
        title: `reject-test ${tag}`,
        _modified: '2099-01-01T00:00:00.000Z'
      })
    } catch (err: any) {
      postRejected = true
      assert.ok(err.status >= 400, `Expected HTTP error status, got ${err.status}`)
    }
    assert.ok(postRejected, 'POST with _modified should have been rejected')

    // Create a valid dataset to test PATCH rejection
    const validRes = await ax.post('/api/v1/datasets', {
      isMetaOnly: true,
      title: `patch-reject-test ${tag}`
    })
    assert.equal(validRes.status, 201)
    const datasetId = validRes.data.id

    // PATCH with _modified should be rejected by schema validation
    let patchRejected = false
    try {
      await ax.patch(`/api/v1/datasets/${datasetId}`, {
        _modified: '2099-01-01T00:00:00.000Z'
      })
    } catch (err: any) {
      patchRejected = true
      assert.ok(err.status >= 400, `Expected HTTP error status, got ${err.status}`)
    }
    assert.ok(patchRejected, 'PATCH with _modified should have been rejected')
  })
})
