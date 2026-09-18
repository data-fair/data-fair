import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axios, axiosAuth, clean, checkPendingTasks, config, mockAppUrl } from '../../support/axios.ts'
import { sendDataset, clearDatasetCache } from '../../support/workers.ts'

const anonymous = axios()
const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')
const testUser3 = await axiosAuth('test_user3@test.com')

test.describe('application context for dataset fragments', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('a reader of the application reads a utility dataset only in the application context, with the declared operations', async () => {
    const dashboard = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    const sub = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1'), partOf: { type: 'application', id: dashboard.id } })).data
    const utility = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'application', id: dashboard.id } })
    const unreferenced = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'application', id: dashboard.id } })
    const href = `${config.publicUrl}/api/v1/datasets/${utility.id}`
    await testUser1Org.put(`/api/v1/applications/${dashboard.id}/config`, { datasets: [{ href, id: utility.id }] })
    await testUser1Org.put(`/api/v1/applications/${sub.id}/config`, { datasets: [{ href, id: utility.id, applicationKeyPermissions: { operations: ['readSafeSchema'] } }] })
    const parentPermissions = (await testUser1Org.get(`/api/v1/applications/${dashboard.id}/permissions`)).data
    await testUser1Org.put(`/api/v1/applications/${dashboard.id}/permissions`, [...parentPermissions, { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['list', 'read'] }])
    await clearDatasetCache()

    // no context: no read
    await assert.rejects(testUser3.get(`/api/v1/datasets/${utility.id}/lines`), { status: 403 })
    // dashboard context: default read class
    let res = await testUser3.get(`/api/v1/datasets/${utility.id}/lines`, { headers: { referer: `${config.publicUrl}/app/${dashboard.id}/` } })
    assert.equal(res.status, 200)
    // sub-application context: the sub-app's declared operations only
    await assert.rejects(testUser3.get(`/api/v1/datasets/${utility.id}/lines`, { headers: { referer: `${config.publicUrl}/app/${sub.id}/` } }), { status: 403 })
    res = await testUser3.get(`/api/v1/datasets/${utility.id}/safe-schema`, { headers: { referer: `${config.publicUrl}/app/${sub.id}/` } })
    assert.equal(res.status, 200)
    // a fragment not referenced by the calling application stays unreadable
    await assert.rejects(testUser3.get(`/api/v1/datasets/${unreferenced.id}/lines`, { headers: { referer: `${config.publicUrl}/app/${dashboard.id}/` } }), { status: 403 })
    // anonymous: nothing without a key
    await assert.rejects(anonymous.get(`/api/v1/datasets/${utility.id}/lines`, { headers: { referer: `${config.publicUrl}/app/${dashboard.id}/` } }), { status: 403 })

    // a key on the dashboard opens the sub-application and the utility dataset anonymously
    const key = (await testUser1Org.post(`/api/v1/applications/${dashboard.id}/keys`, [{ title: 'k' }])).data[0].id
    assert.equal((await anonymous.get(`/app/${sub.id}/?key=${key}`, { maxRedirects: 0 })).status, 200)
    res = await anonymous.get(`/api/v1/datasets/${utility.id}/lines`, { headers: { referer: `${config.publicUrl}/app/${dashboard.id}/?key=${key}` } })
    assert.equal(res.status, 200)
    res = await anonymous.get(`/api/v1/datasets/${utility.id}/safe-schema`, { headers: { referer: `${config.publicUrl}/app/${sub.id}/?key=${key}` } })
    assert.equal(res.status, 200)
  })

  test('non-fragment datasets keep the key-only behaviour', async () => {
    const app = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    await testUser1Org.put(`/api/v1/applications/${app.id}/config`, { datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${dataset.id}`, id: dataset.id }] })
    const parentPermissions = (await testUser1Org.get(`/api/v1/applications/${app.id}/permissions`)).data
    await testUser1Org.put(`/api/v1/applications/${app.id}/permissions`, [...parentPermissions, { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['list', 'read'] }])
    await assert.rejects(testUser3.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { referer: `${config.publicUrl}/app/${app.id}/` } }), { status: 403 })
  })
})
