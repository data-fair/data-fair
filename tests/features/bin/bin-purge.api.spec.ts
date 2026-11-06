import { test } from '../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, anonymousAx, apiUrl } from '../../support/axios.ts'
import { sendDataset, patchRawDataset, waitForFinalize } from '../../support/workers.ts'

const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')

const setBin = (bin: Record<string, any>) => testUser1Org.patch('/api/v1/settings/organization/test_org1', { bin })
const restDataset = async (id: string) => {
  await testUser1Org.post(`/api/v1/datasets/${id}`, { isRest: true, title: id, schema: [{ key: 'str', type: 'string' }] })
  await testUser1Org.post(`/api/v1/datasets/${id}/_bulk_lines`, [{ str: 'a' }])
  await waitForFinalize(testUser1Org, id)
}
const runPurge = () => anonymousAx.post(`${apiUrl}/api/v1/test-env/bin-purge/run`)
const binIds = async () => (await testUser1Org.get('/api/v1/bin')).data.results.map((r: any) => r.id).sort()
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString()
const waitFor = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 60; i++) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.fail('condition not reached')
}

test.describe('bin purge', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('the cron purges only what is past retention', async () => {
    await setBin({ active: true, retentionDays: 1 })
    await restDataset('purge-old')
    await restDataset('purge-new')
    await testUser1Org.delete('/api/v1/datasets/purge-old')
    await testUser1Org.delete('/api/v1/datasets/purge-new')
    await patchRawDataset('purge-old', { 'shelved.at': daysAgo(2) })
    await runPurge()
    assert.deepEqual(await binIds(), ['purge-new'])
  })

  test('retention shortened purges what is already past the new one', async () => {
    await setBin({ active: true, retentionDays: 30 })
    await restDataset('purge-short')
    await testUser1Org.delete('/api/v1/datasets/purge-short')
    await patchRawDataset('purge-short', { 'shelved.at': daysAgo(2) })
    await runPurge()
    assert.deepEqual(await binIds(), ['purge-short'])
    await setBin({ active: true, retentionDays: 1 })
    await runPurge()
    assert.deepEqual(await binIds(), [])
  })

  test('disabling the bin purges everything, fragments included', async () => {
    await setBin({ active: true })
    const parent = (await testUser1Org.post('/api/v1/datasets', { isMetaOnly: true, title: 'purge parent' })).data
    const fragment = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: parent.id } })
    await restDataset('purge-rest')
    await testUser1Org.delete(`/api/v1/datasets/${parent.id}`)
    await testUser1Org.delete('/api/v1/datasets/purge-rest')
    assert.equal((await binIds()).length, 2, 'the fragment is listed under its parent')
    await setBin({ active: false })
    await waitFor(async () => {
      const ids = await Promise.all([parent.id, fragment.id, 'purge-rest'].map(id => anonymousAx.get(`${apiUrl}/api/v1/test-env/raw-dataset/${id}`, { validateStatus: () => true }).then(r => r.status)))
      return ids.every(s => s === 404)
    })
  })

  test('re-enabled before the run, nothing non expired is purged', async () => {
    await setBin({ active: true })
    const ids = ['purge-race-1', 'purge-race-2', 'purge-race-3']
    for (const id of ids) {
      await testUser1Org.post(`/api/v1/datasets/${id}`, { isMetaOnly: true, title: id })
      await testUser1Org.delete(`/api/v1/datasets/${id}`)
    }
    // the real toggle: only the end state is asserted, the purge started by the disabling races
    await setBin({ active: false })
    await waitFor(async () => (await anonymousAx.get(`${apiUrl}/api/v1/test-env/raw-dataset/purge-race-3`, { validateStatus: () => true })).status === 404)
    // deterministic part: items shelved again and bin enabled before the run survive it
    await setBin({ active: true })
    for (const id of ids) {
      await testUser1Org.post(`/api/v1/datasets/${id}`, { isMetaOnly: true, title: id })
      await testUser1Org.delete(`/api/v1/datasets/${id}`)
    }
    await runPurge()
    assert.deepEqual(await binIds(), ids)
  })
})
