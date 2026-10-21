import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { getRawDataset } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const settingsUrl = '/api/v1/settings/user/test_user1'
// only the summary counts, 50 to 250 characters by default
const summaryOnly = { summary: { weight: 1 }, description: { weight: 0 }, license: { weight: 0 }, origin: { weight: 0 }, topics: { weight: 0 } }

// the worker rescores the datasets a settings change marked stale
const waitForRescore = async (id: string) => {
  for (let i = 0; i < 100; i++) {
    const raw = await getRawDataset(id)
    if (!raw._needsSearchIndex) return raw
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('the dataset was not rescored')
}

test.describe('metadata completeness score', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('no score until the owner activates it', async () => {
    const { data: dataset } = await testUser1.post('/api/v1/datasets', { isMetaOnly: true, title: 'no score', summary: 'x'.repeat(100) })
    assert.equal(dataset.completeness, undefined)
    assert.equal((await testUser1.get('/api/v1/datasets/' + dataset.id)).data.completeness, undefined)
  })

  test('computed on create and on metadata patches', async () => {
    await testUser1.put(settingsUrl, { datasetsMetadata: { completeness: { active: true }, ...summaryOnly } })
    const { data: dataset } = await testUser1.post('/api/v1/datasets', { isMetaOnly: true, title: 'scored' })
    assert.equal(dataset.completeness, 0)

    // filled but shorter than recommended: half
    let res = await testUser1.patch('/api/v1/datasets/' + dataset.id, { summary: 'too short' })
    assert.equal(res.data.completeness, 50)
    // the detail is stored with the score, for the portals
    assert.deepEqual(res.data.completenessCriteria, [{ key: 'summary', custom: false, weight: 1, size: 9, recommendedMin: 50, recommendedMax: 250, note: 0.5 }])
    assert.ok(!Object.keys(res.data).includes('_needsSearchIndex'))
    res = await testUser1.patch('/api/v1/datasets/' + dataset.id, { summary: 'x'.repeat(100) })
    assert.equal(res.data.completeness, 100)
    assert.equal((await testUser1.get('/api/v1/datasets/' + dataset.id)).data.completeness, 100)

    // the score is readonly
    await assert.rejects(testUser1.patch('/api/v1/datasets/' + dataset.id, { completeness: 10 }), { status: 400 })
  })

  test('a settings change rescores the datasets, deactivating removes the score', async () => {
    await testUser1.put(settingsUrl, { datasetsMetadata: { completeness: { active: true }, ...summaryOnly } })
    const { data: dataset } = await testUser1.post('/api/v1/datasets', { isMetaOnly: true, title: 'rescored', summary: 'too short' })
    assert.equal(dataset.completeness, 50)

    // a custom metadata weighs 1 by default and the dataset has no value for it
    await testUser1.put(settingsUrl, { datasetsMetadata: { completeness: { active: true }, ...summaryOnly, summary: { weight: 1, recommendedMin: 5 }, custom: [{ key: 'service', title: 'Service' }] } })
    assert.equal((await waitForRescore(dataset.id)).completeness, 50)
    assert.equal((await testUser1.get('/api/v1/datasets/' + dataset.id)).data.completeness, 50)

    const res = await testUser1.patch('/api/v1/datasets/' + dataset.id, { customMetadata: { service: 'Voirie' } })
    assert.equal(res.data.completeness, 100)

    await testUser1.put(settingsUrl, { datasetsMetadata: { completeness: { active: false }, ...summaryOnly } })
    const raw = await waitForRescore(dataset.id)
    assert.equal(raw.completeness, undefined)
    assert.equal(raw.completenessCriteria, undefined)
    assert.equal((await testUser1.get('/api/v1/datasets/' + dataset.id)).data.completeness, undefined)
  })
})
