import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axios, axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')   // admin of test_org1
const testUser5Org = await axiosAuth('test_user5@test.com', 'test_org1')   // contrib of test_org1
const testUser3 = await axiosAuth('test_user3@test.com')                   // external
const anonymous = axios()

const createApp = async (ax = testUser1Org, body: any = {}) => (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), ...body })).data

test.describe('application fragments', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('create a sub-application with a derived ACL, attach and detach', async () => {
    const dashboard = await createApp()
    const sub = await createApp(testUser1Org, { title: 'sub', partOf: { type: 'application', id: dashboard.id } })
    assert.deepEqual(sub.partOf, { type: 'application', id: dashboard.id })
    let permissions = (await testUser1Org.get(`/api/v1/applications/${sub.id}/permissions`)).data
    // write+delete entry kept, and the contrib read entry is kept too (application -> application)
    assert.equal(permissions.length, 2)
    assert.deepEqual(permissions[0].classes, ['list', 'read', 'readAdvanced', 'write'])
    assert.deepEqual(permissions[1].classes, ['list', 'read'])

    // contributor can read and edit, cannot attach/detach (delete gate is admin-class on applications? no: contribs hold `delete` by default -> they CAN)
    const res = await testUser5Org.get(`/api/v1/applications/${sub.id}`)
    assert.ok(res.data.userPermissions.includes('writeDescription'))

    // PUT replace keeps partOf
    await testUser1Org.put(`/api/v1/applications/${sub.id}`, { url: mockAppUrl('monapp1'), title: 'sub renamed' })
    assert.deepEqual((await testUser1Org.get(`/api/v1/applications/${sub.id}`)).data.partOf, { type: 'application', id: dashboard.id })

    // guards
    await assert.rejects(testUser1Org.patch(`/api/v1/applications/${sub.id}`, { publicationSites: [] }), { status: 400 })
    await assert.rejects(testUser1Org.put(`/api/v1/applications/${sub.id}/permissions`, []), { status: 403 })
    await assert.rejects(testUser1Org.put(`/api/v1/applications/${sub.id}/owner`, { type: 'user', id: 'test_user1', name: 'Test User1' }), { status: 403 })
    await assert.rejects(testUser1Org.put(`/api/v1/applications/${dashboard.id}/owner`, { type: 'user', id: 'test_user1', name: 'Test User1' }), { status: 400 })

    // detach
    await testUser1Org.patch(`/api/v1/applications/${sub.id}`, { partOf: null })
    assert.equal((await testUser1Org.get(`/api/v1/applications/${sub.id}`)).data.partOf, undefined)
    permissions = (await testUser1Org.get(`/api/v1/applications/${sub.id}/permissions`)).data
    assert.equal(permissions.length, 2)

    // attach an existing app
    await testUser1Org.patch(`/api/v1/applications/${sub.id}`, { partOf: { type: 'application', id: dashboard.id } })
    assert.deepEqual((await testUser1Org.get(`/api/v1/applications/${sub.id}`)).data.partOf, { type: 'application', id: dashboard.id })
  })

  test('refusals: an application cannot be a fragment of a dataset', async () => {
    const virtual = (await testUser1Org.post('/api/v1/datasets', { isVirtual: true, title: 'v' })).data
    await assert.rejects(createApp(testUser1Org, { partOf: { type: 'dataset', id: virtual.id } }), { status: 400 })
  })

  test('PUT on an existing sub-application echoing its partOf is not blocked by the parent check', async () => {
    const dashboard = await createApp()
    const parentPermissions = (await testUser1Org.get(`/api/v1/applications/${dashboard.id}/permissions`)).data
    // write-only entry on the parent: derived to write + read on the sub-application, but no readDescription on the parent itself
    await testUser1Org.put(`/api/v1/applications/${dashboard.id}/permissions`, [...parentPermissions, { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['write'] }])
    const sub = await createApp(testUser1Org, { title: 'sub', partOf: { type: 'application', id: dashboard.id } })
    const res = await testUser3.put(`/api/v1/applications/${sub.id}`, { url: mockAppUrl('monapp1'), title: 'sub renamed by test_user3', partOf: { type: 'application', id: dashboard.id } })
    assert.equal(res.status, 200)
    assert.deepEqual((await testUser1Org.get(`/api/v1/applications/${sub.id}`)).data.partOf, { type: 'application', id: dashboard.id })
  })

  test('a parent ACL change re-syncs its fragments', async () => {
    const dashboard = await createApp()
    const sub = await createApp(testUser1Org, { title: 'sub', partOf: { type: 'application', id: dashboard.id } })
    await assert.rejects(testUser3.get(`/api/v1/applications/${sub.id}`), { status: 403 })
    const parentPermissions = (await testUser1Org.get(`/api/v1/applications/${dashboard.id}/permissions`)).data
    await testUser1Org.put(`/api/v1/applications/${dashboard.id}/permissions`, [...parentPermissions, { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['list', 'read'] }])
    const res = await testUser3.get(`/api/v1/applications/${sub.id}`)
    assert.ok(res.data.userPermissions.includes('readConfig'))
    assert.ok(!res.data.userPermissions.includes('writeDescription'))
    // the proxy lets a reader of the dashboard open the sub-application
    const html = await testUser3.get(`/app/${sub.id}/`, { maxRedirects: 0 })
    assert.equal(html.status, 200)
    await assert.rejects(anonymous.get(`/app/${sub.id}/`, { maxRedirects: 0 }), { status: 302 })
    // public dashboard -> public sub-application
    await testUser1Org.put(`/api/v1/applications/${dashboard.id}/permissions`, [...parentPermissions, { classes: ['list', 'read'] }])
    assert.equal((await anonymous.get(`/app/${sub.id}/`, { maxRedirects: 0 })).status, 200)
    assert.equal((await anonymous.get(`/api/v1/applications/${sub.id}`)).data.visibility, 'public')
  })

  test('deleting the dashboard deletes its sub-applications and utility datasets', async () => {
    const dashboard = await createApp()
    const sub = await createApp(testUser1Org, { partOf: { type: 'application', id: dashboard.id } })
    const utility = (await testUser1Org.post('/api/v1/datasets', { isRest: true, title: 'u', partOf: { type: 'application', id: dashboard.id } })).data
    await testUser1Org.delete(`/api/v1/applications/${dashboard.id}`)
    await assert.rejects(testUser1Org.get(`/api/v1/applications/${sub.id}`), { status: 404 })
    await assert.rejects(testUser1Org.get(`/api/v1/datasets/${utility.id}`), { status: 404 })
  })

  test('deleting an application recomputes the owner storage after cascading a draft dataset fragment', async () => {
    const dashboard = await createApp()
    // still a draft at delete time: deleteDataset's own internal storage recompute is skipped for
    // a draft (guarded by `!dataset.draftReason` at every call site), and deleteApplication has no
    // trailing recompute of its own — so only deleteFragments' post-loop updateTotalStorage call
    // can account for it.
    const fragment = await sendDataset('datasets/dataset1.csv', testUser1Org, { params: { draft: 'true' } }, { partOf: { type: 'application', id: dashboard.id } })
    const fragmentFull = (await testUser1Org.get(`/api/v1/datasets/${fragment.id}`, { params: { draft: 'true' } })).data
    assert.ok(fragmentFull.draftReason)
    // an unrelated, fully finalized dataset for the same owner: its own finalize pass calls
    // updateTotalStorage, which primes the owner's cached totals to a real (non-default) baseline
    // that already counts the draft fragment — otherwise "before" would trivially read 0 regardless
    // of whether the fragment's removal is ever accounted for.
    await sendDataset('datasets/dataset1.csv', testUser1Org)
    const before = (await testUser1Org.get('/api/v1/stats')).data
    assert.equal(before.limits.nb_datasets.consumption, 2)

    await testUser1Org.delete(`/api/v1/applications/${dashboard.id}`)
    await assert.rejects(testUser1Org.get(`/api/v1/datasets/${fragment.id}`), { status: 404 })

    const after = (await testUser1Org.get('/api/v1/stats')).data
    // the draft fragment is gone: the owner's cached dataset count must reflect it, not stay stale
    assert.equal(after.limits.nb_datasets.consumption, 1)
    // the remaining dataset's own bytes are untouched by the cascade
    assert.equal(after.limits.store_bytes.consumption, before.limits.store_bytes.consumption)
  })
})
