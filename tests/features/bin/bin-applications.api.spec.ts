import { test } from '../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import { axios, axiosAuth, clean, checkPendingTasks, config, mockAppUrl } from '../../support/axios.ts'
import { sendDataset, patchRawApplication, clearDatasetCache } from '../../support/workers.ts'

const anonymous = axios()
const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1') // admin of test_org1

const shelved = () => ({ at: new Date().toISOString(), by: { id: 'test_user1', name: 'x' } })

test.describe('shelved reads as missing', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('a shelved application answers 404 by id, by slug and when served', async () => {
    const app = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'binned app' })).data
    assert.ok(app.slug)
    assert.equal((await testUser1Org.get(`/api/v1/applications/${app.id}`)).status, 200)
    assert.equal((await testUser1Org.get(`/app/${app.id}/`)).status, 200)
    await patchRawApplication(app.id, { shelved: shelved() })
    for (const key of [app.id, app.slug]) {
      await assert.rejects(testUser1Org.get(`/api/v1/applications/${key}`), { status: 404 })
      await assert.rejects(testUser1Org.get(`/api/v1/applications/${key}/config`), { status: 404 })
      await assert.rejects(testUser1Org.get(`/api/v1/applications/${key}/permissions`), { status: 404 })
    }
    await assert.rejects(testUser1Org.get(`/app/${app.id}/`), { status: 404 })
  })

  test('a shelved application loses its application key', async () => {
    const dashboard = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    const utility = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'application', id: dashboard.id } })
    await testUser1Org.put(`/api/v1/applications/${dashboard.id}/config`, { datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${utility.id}`, id: utility.id }] })
    const key = (await testUser1Org.post(`/api/v1/applications/${dashboard.id}/keys`, [{ title: 'k' }])).data[0].id
    await patchRawApplication(dashboard.id, { shelved: shelved() })
    await clearDatasetCache()
    await assert.rejects(anonymous.get(`/app/${dashboard.id}/?key=${key}`, { maxRedirects: 0 }), { status: 404 })
    await assert.rejects(anonymous.get(`/api/v1/datasets/${utility.id}/lines`, { headers: { referer: `${config.publicUrl}/app/${dashboard.id}/?key=${key}` } }), (err: any) => [403, 404].includes(err.status))
  })

  test('initFrom a shelved application answers 404', async () => {
    const source = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    await patchRawApplication(source.id, { shelved: shelved() })
    await assert.rejects(testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1'), initFrom: { application: source.id } }), { status: 404 })
  })
})
