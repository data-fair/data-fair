import { test } from '../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'
import { sendDataset, getRawDataset, getRawApplication, waitForFinalize } from '../../support/workers.ts'
import { ensureIntegrityBucket, waitForFlagCleared, revisionsPrefix, listIntegrityKeys, integrityTestStore } from '../../support/integrity.ts'
import { nhiSession } from '../../support/nhi.ts'

const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1') // root admin of test_org1
const testUser4Dep1 = await axiosAuth('test_user4@test.com', 'test_org1') // admin of dep1
testUser4Dep1.setOrg('test_org1', 'dep1')
const testUser5Org = await axiosAuth('test_user5@test.com', 'test_org1') // contrib
const testSuperadmin = await axiosAuth('test_superadmin@test.com', undefined, true)

const esHost = `localhost:${process.env.ES_PORT}`
const indicesPrefix = 'dataset-development'

const enableBin = async (retentionDays?: number) => {
  await testUser1Org.patch('/api/v1/settings/organization/test_org1', { bin: { active: true, ...(retentionDays ? { retentionDays } : {}) } })
}
const restDataset = async (ax: any, id: string, title = id) => {
  await ax.post(`/api/v1/datasets/${id}`, { isRest: true, title, schema: [{ key: 'str', type: 'string' }] })
  await ax.post(`/api/v1/datasets/${id}/_bulk_lines`, [{ str: 'a' }])
  await waitForFinalize(ax, id)
}

test.describe('bin admin API', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('the listing is 404 when the bin is off', async () => {
    await assert.rejects(testUser1Org.get('/api/v1/bin'), { status: 404 })
  })

  test('root admin lists the whole bin, a department admin only its department, a contrib nothing', async () => {
    await enableBin()
    await restDataset(testUser1Org, 'bin-root', 'Bin root')
    await restDataset(testUser4Dep1, 'bin-dep1', 'Bin dep1')
    assert.equal((await testUser1Org.get('/api/v1/datasets/bin-dep1')).data.owner.department, 'dep1')
    await testUser1Org.delete('/api/v1/datasets/bin-root')
    await testUser4Dep1.delete('/api/v1/datasets/bin-dep1')

    const root = (await testUser1Org.get('/api/v1/bin')).data
    assert.equal(root.count, 2)
    assert.deepEqual(root.results.map((r: any) => r.id).sort(), ['bin-dep1', 'bin-root'])
    assert.equal(root.results[0].shelved.at >= root.results[1].shelved.at, true, 'newest first')
    const rootItem = root.results.find((r: any) => r.id === 'bin-root')
    assert.equal(rootItem.type, 'datasets')
    assert.equal(rootItem.title, 'Bin root')
    assert.equal(rootItem.fragments, 0)

    const dep = (await testUser4Dep1.get('/api/v1/bin')).data
    assert.deepEqual(dep.results.map((r: any) => r.id), ['bin-dep1'])

    await assert.rejects(testUser5Org.get('/api/v1/bin'), { status: 403 })

    // q is a case-insensitive filter on title and slug, regex characters are escaped
    assert.deepEqual((await testUser1Org.get('/api/v1/bin', { params: { q: 'BIN ROOT' } })).data.results.map((r: any) => r.id), ['bin-root'])
    assert.deepEqual((await testUser1Org.get('/api/v1/bin', { params: { q: 'bin-dep' } })).data.results.map((r: any) => r.id), ['bin-dep1'])
    assert.equal((await testUser1Org.get('/api/v1/bin', { params: { q: '.*' } })).data.count, 0)

    // restore: a department admin cannot touch the root item, can restore its own
    await assert.rejects(testUser4Dep1.post('/api/v1/bin/datasets/bin-root/_restore'), { status: 403 })
    await assert.rejects(testUser4Dep1.delete('/api/v1/bin/datasets/bin-root'), { status: 403 })
    await assert.rejects(testUser5Org.post('/api/v1/bin/datasets/bin-dep1/_restore'), { status: 403 })
    assert.equal((await testUser4Dep1.post('/api/v1/bin/datasets/bin-dep1/_restore')).status, 204)
    assert.equal((await testUser4Dep1.get('/api/v1/datasets/bin-dep1')).status, 200)
    assert.deepEqual((await testUser1Org.get('/api/v1/bin')).data.results.map((r: any) => r.id), ['bin-root'])
    await assert.rejects(testUser4Dep1.post('/api/v1/bin/datasets/bin-dep1/_restore'), { status: 404 })
    await assert.rejects(testUser1Org.post('/api/v1/bin/other/x/_restore'), { status: 400 })
  })

  test('a scoped session is refused', async () => {
    await enableBin()
    const { bearerAx } = await nhiSession('all:admin')
    await assert.rejects(bearerAx.get('/api/v1/bin'), { status: 403 })
  })

  test('purgeAt is shelved.at plus the retention in days', async () => {
    await enableBin(7)
    await restDataset(testUser1Org, 'bin-purge-at')
    await testUser1Org.delete('/api/v1/datasets/bin-purge-at')
    const item = (await testUser1Org.get('/api/v1/bin')).data.results[0]
    assert.equal(item.purgeAt, new Date(new Date(item.shelved.at).getTime() + 7 * 86400000).toISOString())
  })

  test('a cascaded fragment is counted in its parent, absent from the results and not restorable alone', async () => {
    await enableBin()
    const dashboard = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'bin dashboard' })).data
    const utility = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'application', id: dashboard.id } })
    await testUser1Org.delete(`/api/v1/applications/${dashboard.id}`)
    assert.equal((await getRawDataset(utility.id)).shelved.cascade, true)

    const list = (await testUser1Org.get('/api/v1/bin')).data
    assert.deepEqual(list.results.map((r: any) => [r.type, r.id, r.fragments]), [['applications', dashboard.id, 1]])
    await assert.rejects(testUser1Org.post(`/api/v1/bin/datasets/${utility.id}/_restore`), { status: 404 })
    await assert.rejects(testUser1Org.delete(`/api/v1/bin/datasets/${utility.id}`), { status: 404 })

    assert.equal((await testUser1Org.post(`/api/v1/bin/applications/${dashboard.id}/_restore`)).status, 204)
    assert.equal((await getRawDataset(utility.id)).shelved, undefined)
    assert.equal((await testUser1Org.get(`/api/v1/datasets/${utility.id}`)).status, 200)
  })

  test('a fragment shelved on its own cannot be restored while its parent is in the bin', async () => {
    await enableBin()
    const dashboard = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'bin dashboard' })).data
    const utility = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'application', id: dashboard.id } })
    await testUser1Org.delete(`/api/v1/datasets/${utility.id}`)
    await testUser1Org.delete(`/api/v1/applications/${dashboard.id}`)
    const raw = await getRawDataset(utility.id)
    assert.equal(raw.shelved.cascade, undefined, 'keeps its own marker')

    const list = (await testUser1Org.get('/api/v1/bin')).data
    assert.deepEqual(list.results.map((r: any) => r.id).sort(), [dashboard.id, utility.id].sort())
    await assert.rejects(testUser1Org.post(`/api/v1/bin/datasets/${utility.id}/_restore`), (err: any) => err.status === 409)

    await testUser1Org.post(`/api/v1/bin/applications/${dashboard.id}/_restore`)
    assert.ok((await getRawDataset(utility.id)).shelved, 'still shelved')
    assert.equal((await testUser1Org.post(`/api/v1/bin/datasets/${utility.id}/_restore`)).status, 204)
  })

  test('DELETE purges: gone from mongo and ES, terminal integrity revision, cascaded fragments, limits decrease', async () => {
    await ensureIntegrityBucket()
    await enableBin()
    const dashboard = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'purge dashboard' })).data
    const fragment = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'application', id: dashboard.id } })
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    await testSuperadmin.put(`/api/v1/datasets/${dataset.id}/_integrity`, { active: true })
    await waitForFlagCleared(dataset.id)
    const prefix = revisionsPrefix(dataset)

    const alias = `${indicesPrefix}-${dataset.id}`
    assert.equal((await testUser1Org.get(`http://${esHost}/${alias}`)).status, 200)
    const limitsBefore = (await testUser1Org.get('/api/v1/limits/organization/test_org1')).data

    await testUser1Org.delete(`/api/v1/datasets/${dataset.id}`)
    await testUser1Org.delete(`/api/v1/applications/${dashboard.id}`)
    assert.equal((await testUser1Org.get('/api/v1/bin')).data.count, 2)
    // shelving alone does not touch the stored data
    assert.equal((await testUser1Org.get('/api/v1/limits/organization/test_org1')).data.nb_datasets.consumption, limitsBefore.nb_datasets.consumption)

    assert.equal((await testUser1Org.delete(`/api/v1/bin/datasets/${dataset.id}`)).status, 204)
    await assert.rejects(getRawDataset(dataset.id), { status: 404 })
    await assert.rejects(testUser1Org.get(`http://${esHost}/${alias}`), { status: 404 })
    const keys = (await listIntegrityKeys(prefix)).filter(k => !k.endsWith('.file') && !k.endsWith('.who') && !k.includes('/lines/'))
    const rev = await integrityTestStore.getRevision(keys.sort().at(-1)!)
    assert.equal(rev.context.operation, 'delete')

    assert.equal((await testUser1Org.delete(`/api/v1/bin/applications/${dashboard.id}`)).status, 204)
    await assert.rejects(getRawApplication(dashboard.id), { status: 404 })
    await assert.rejects(getRawDataset(fragment.id), { status: 404 }, 'the cascaded fragment is purged too')
    assert.equal((await testUser1Org.get('/api/v1/bin')).data.count, 0)

    const limitsAfter = (await testUser1Org.get('/api/v1/limits/organization/test_org1')).data
    assert.equal(limitsAfter.nb_datasets.consumption, limitsBefore.nb_datasets.consumption - 2)
    assert.ok(limitsAfter.store_bytes.consumption < limitsBefore.store_bytes.consumption)
    await assert.rejects(testUser1Org.delete(`/api/v1/bin/datasets/${dataset.id}`), { status: 404 })
  })
})
