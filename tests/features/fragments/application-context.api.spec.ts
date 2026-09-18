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

  // fix round 1 / finding 1: a fragment of the key's application must not be usable to read an
  // unrelated same-owner dataset just because that fragment's own config happens to reference it.
  // Attaching the fragment only needed readDescription on the dashboard (deliberately, not write);
  // widening the key's reach to "anything the fragment references" would let any org member with
  // read+create-application rights leak an arbitrary dataset through the dashboard's distributed key.
  test('a fragment of the key app cannot leak an unrelated dataset it merely references in its own config', async () => {
    const dashboard = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    const sub = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1'), partOf: { type: 'application', id: dashboard.id } })).data
    // unrelated: same owner, but NOT a fragment of the dashboard
    const unrelated = await sendDataset('datasets/dataset1.csv', testUser1Org)
    await testUser1Org.put(`/api/v1/applications/${sub.id}/config`, { datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${unrelated.id}`, id: unrelated.id }] })
    const key = (await testUser1Org.post(`/api/v1/applications/${dashboard.id}/keys`, [{ title: 'k' }])).data[0].id
    await assert.rejects(anonymous.get(`/api/v1/datasets/${unrelated.id}/lines`, { headers: { referer: `${config.publicUrl}/app/${sub.id}/?key=${key}` } }), { status: 403 })
  })

  // fix round 1 / finding 3: without this, deleting the readConfig gate in the session-proof branch
  // keeps the whole suite green.
  test('a session with no permission at all on the calling application gets no bypass', async () => {
    const dashboard = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    const utility = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'application', id: dashboard.id } })
    await testUser1Org.put(`/api/v1/applications/${dashboard.id}/config`, { datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${utility.id}`, id: utility.id }] })
    await clearDatasetCache()
    // test_user3 was never granted any permission on the dashboard
    await assert.rejects(testUser3.get(`/api/v1/datasets/${utility.id}/lines`, { headers: { referer: `${config.publicUrl}/app/${dashboard.id}/` } }), { status: 403 })
  })

  // fix round 1 / finding 3: without this, deleting the reachability check in the session-proof
  // branch keeps the whole suite green — `other` legitimately references the dataset in its own
  // config and the user legitimately can read `other`, but `other` has no declared relationship
  // (parent / fragment / configured child) to the dataset's actual parent application.
  test('a forged referer naming an unrelated application does not unlock the fragment dataset', async () => {
    const dashboard = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    const utility = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'application', id: dashboard.id } })
    const other = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    await testUser1Org.put(`/api/v1/applications/${other.id}/config`, { datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${utility.id}`, id: utility.id }] })
    const otherPermissions = (await testUser1Org.get(`/api/v1/applications/${other.id}/permissions`)).data
    await testUser1Org.put(`/api/v1/applications/${other.id}/permissions`, [...otherPermissions, { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['list', 'read'] }])
    await clearDatasetCache()
    await assert.rejects(testUser3.get(`/api/v1/datasets/${utility.id}/lines`, { headers: { referer: `${config.publicUrl}/app/${other.id}/` } }), { status: 403 })
  })

  // fix round 1 / finding 2: findCallingApplication memoizes the calling application's permissions
  // for 30s; without clearApplicationKeysCaches() wired into the permissions onUpdated hook, a
  // revoked permission would keep granting the session-proof bypass for up to 30s. This proves the
  // invalidation is immediate, without a sleep.
  test('revoking a permission on the calling application immediately closes the session-proof bypass', async () => {
    const dashboard = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    const utility = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'application', id: dashboard.id } })
    await testUser1Org.put(`/api/v1/applications/${dashboard.id}/config`, { datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${utility.id}`, id: utility.id }] })
    const parentPermissions = (await testUser1Org.get(`/api/v1/applications/${dashboard.id}/permissions`)).data
    await testUser1Org.put(`/api/v1/applications/${dashboard.id}/permissions`, [...parentPermissions, { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['list', 'read'] }])
    await clearDatasetCache()
    const res = await testUser3.get(`/api/v1/datasets/${utility.id}/lines`, { headers: { referer: `${config.publicUrl}/app/${dashboard.id}/` } })
    assert.equal(res.status, 200)

    await testUser1Org.put(`/api/v1/applications/${dashboard.id}/permissions`, parentPermissions)
    await assert.rejects(testUser3.get(`/api/v1/datasets/${utility.id}/lines`, { headers: { referer: `${config.publicUrl}/app/${dashboard.id}/` } }), { status: 403 })
  })
})
