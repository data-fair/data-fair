import { test } from '../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { axiosAuth, clean, checkPendingTasks, anonymousAx, apiUrl, mockAppUrl, mockAppId } from '../../support/axios.ts'
import { sdTestEnvUrl } from '../../support/sd-fixtures.ts'
import { doAndWaitForFinalize, datasetEsIndicesCount, setupMockRoute, clearMockRoutes } from '../../support/workers.ts'

const geocoderApi = JSON.parse(readFileSync(path.resolve('./tests/resources/geocoder-api.json'), 'utf8'))

// another sub-space than this suite's: its data must survive the cleanup of test_datafair_
const otherPrefix = 'test_datafairother_'
const otherWorld = {
  prefix: otherPrefix,
  users: [{ id: `${otherPrefix}user`, firstName: 'Other', lastName: 'User', email: `${otherPrefix}user@test.com`, password: { clear: 'passwd' } }],
  organizations: []
}

const cleanOtherWorld = async () => {
  await anonymousAx.delete(sdTestEnvUrl(), { params: { prefix: otherPrefix } })
  await anonymousAx.delete(`${apiUrl}/api/v1/test-env`, { params: { prefix: otherPrefix } })
}

test.describe('test-env cleanup', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    await clearMockRoutes()
    await cleanOtherWorld()
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('refuses a missing or invalid prefix', async () => {
    for (const params of [{}, { prefix: 'test_' }, { prefix: 'test_datafair' }, { prefix: 'other_' }]) {
      await assert.rejects(anonymousAx.delete(`${apiUrl}/api/v1/test-env`, { params }), { status: 400 })
    }
  })

  test('keeps the indices of a dataset of another sub-space whose id extends a cleaned dataset id', async () => {
    await anonymousAx.post(`${sdTestEnvUrl()}/seed`, otherWorld)
    const testUser1 = await axiosAuth('test_datafair_user1@test.com')
    const otherUser = await axiosAuth(`${otherPrefix}user@test.com`)

    await doAndWaitForFinalize(testUser1, 'clean-es', () => testUser1.put('/api/v1/datasets/clean-es', { isRest: true, title: 'cleaned' }))
    await doAndWaitForFinalize(otherUser, 'clean-es-kept', () => otherUser.put('/api/v1/datasets/clean-es-kept', { isRest: true, title: 'kept' }))
    assert.equal(await datasetEsIndicesCount('clean-es'), 1)
    assert.equal(await datasetEsIndicesCount('clean-es-kept'), 1)

    await clean()

    await assert.rejects(testUser1.get('/api/v1/datasets/clean-es'), { status: 404 })
    assert.equal((await otherUser.get('/api/v1/datasets/clean-es-kept')).status, 200)
    assert.equal(await datasetEsIndicesCount('clean-es-kept'), 1)
  })
  test('keeps the remote services, base applications and locks of another sub-space', async () => {
    await anonymousAx.post(`${sdTestEnvUrl()}/seed`, otherWorld)
    const superadmin = await axiosAuth('test_datafair_superadmin@test.com', undefined, true)
    const testUser1 = await axiosAuth('test_datafair_user1@test.com')
    const otherUser = await axiosAuth(`${otherPrefix}user@test.com`)
    const lock = async (datasetId: string) => (await anonymousAx.post(`${apiUrl}/api/v1/test-env/lock/datasets:${datasetId}`)).data.ack

    for (const [prefix, ax, datasetId] of [['test_datafair_', testUser1, 'clean-master'], [otherPrefix, otherUser, 'clean-master-kept']] as const) {
      // a remote service declared by a superadmin under the prefix of the sub-space
      await superadmin.post('/api/v1/remote-services', { id: `${prefix}service`, apiDoc: { ...geocoderApi, info: { ...geocoderApi.info, 'x-api-id': `${prefix}service` } } })
      // a remote service mirroring a master data dataset of the sub-space
      await doAndWaitForFinalize(ax, datasetId, () => ax.put('/api/v1/datasets/' + datasetId, { isRest: true, title: datasetId, schema: [{ key: 'code', type: 'string' }], masterData: { virtualDatasets: { active: true } } }))
      // a base application served under the prefix of the sub-space
      await setupMockRoute({ path: `/${prefix}app/index.html`, contentType: 'text/html', body: `<html><head><meta name="application-name" content="${prefix}app"></head><body></body></html>` })
      await setupMockRoute({ path: `/${prefix}app/config-schema.json`, body: {} })
      await superadmin.post('/api/v1/base-applications', { url: mockAppUrl(`${prefix}app`) })
      // a lock held on a dataset of the sub-space
      assert.equal(await lock(datasetId), true)
    }
    // a shared base application opened to an account of each sub-space
    await superadmin.patch(`/api/v1/base-applications/${mockAppId('monapp2')}`, {
      privateAccess: [{ type: 'user', id: 'test_datafair_user1' }, { type: 'user', id: `${otherPrefix}user` }]
    })

    await clean()

    const remoteService = (id: string) => superadmin.get('/api/v1/remote-services/' + id, { params: { showAll: true } })
    await assert.rejects(remoteService('test_datafair_service'), { status: 404 })
    await assert.rejects(remoteService('dataset:clean-master'), { status: 404 })
    assert.equal((await remoteService(`${otherPrefix}service`)).status, 200)
    assert.equal((await remoteService('dataset:clean-master-kept')).status, 200)

    const baseApps = (await superadmin.get('/api/v1/admin/base-applications', { params: { size: 100 } })).data.results
    const baseAppUrls = baseApps.map((a: any) => a.url)
    assert.ok(!baseAppUrls.includes(mockAppUrl('test_datafair_app')))
    assert.ok(baseAppUrls.includes(mockAppUrl(`${otherPrefix}app`)))
    const monapp2 = baseApps.find((a: any) => a.url === mockAppUrl('monapp2'))
    assert.deepEqual(monapp2.privateAccess.map((p: any) => p.id), [`${otherPrefix}user`])

    // the lock of the cleaned sub-space is gone, the other one is still held
    assert.equal(await lock('clean-master'), true)
    await anonymousAx.delete(`${apiUrl}/api/v1/test-env/lock/datasets:clean-master`)
    assert.equal(await lock('clean-master-kept'), false)
    await anonymousAx.delete(`${apiUrl}/api/v1/test-env/lock/datasets:clean-master-kept`)
  })
})
