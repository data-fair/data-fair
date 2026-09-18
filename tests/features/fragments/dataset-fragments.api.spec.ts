import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { sendDataset, waitForFinalize } from '../../support/workers.ts'

const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')   // admin of test_org1
const testUser5Org = await axiosAuth('test_user5@test.com', 'test_org1')   // contrib of test_org1
const testUser3 = await axiosAuth('test_user3@test.com')                   // external to test_org1

const createVirtual = async (ax = testUser1Org, body: any = {}) => {
  const res = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset', ...body })
  return res.data
}

test.describe('dataset fragments', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('create a dataset fragment of a virtual dataset with a derived ACL', async () => {
    const virtual = await createVirtual()
    const fragment = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: virtual.id } })
    assert.deepEqual(fragment.partOf, { type: 'dataset', id: virtual.id })
    const permissions = (await testUser1Org.get(`/api/v1/datasets/${fragment.id}/permissions`)).data
    // the org-contrib default entries of the parent: write+delete kept and implying read, read-only entry dropped
    assert.equal(permissions.length, 1)
    assert.deepEqual(permissions[0].classes, ['list', 'read', 'readAdvanced', 'write'])
    assert.deepEqual(permissions[0].operations, ['delete'])
    assert.deepEqual(permissions[0].roles, ['contrib'])
  })

  test('a contributor of the parent reads, edits and deletes the fragment', async () => {
    const virtual = await createVirtual()
    const fragment = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: virtual.id } })
    const res = await testUser5Org.get(`/api/v1/datasets/${fragment.id}`)
    assert.ok(res.data.userPermissions.includes('readDescription'))
    assert.ok(res.data.userPermissions.includes('writeDescription'))
    await testUser5Org.patch(`/api/v1/datasets/${fragment.id}`, { title: 'renamed' })
    await testUser5Org.delete(`/api/v1/datasets/${fragment.id}`)
  })

  test('refusals at creation', async () => {
    const virtual = await createVirtual()
    const plain = await sendDataset('datasets/dataset1.csv', testUser1Org)
    // unknown parent
    await assert.rejects(testUser1Org.post('/api/v1/datasets', { isRest: true, title: 'f', partOf: { type: 'dataset', id: 'unknown' } }), { status: 404 })
    // non virtual dataset parent
    await assert.rejects(testUser1Org.post('/api/v1/datasets', { isRest: true, title: 'f', partOf: { type: 'dataset', id: plain.id } }), { status: 400 })
    // parent not readable by the caller
    await assert.rejects(testUser3.post('/api/v1/datasets', { isRest: true, title: 'f', partOf: { type: 'dataset', id: virtual.id } }), { status: 404 })
    // different owner (personal account vs org parent): make the parent public first so that the
    // personal session can read it, otherwise the refusal is the 404 of an unreadable parent
    const parentPermissions = (await testUser1Org.get(`/api/v1/datasets/${virtual.id}/permissions`)).data
    await testUser1Org.put(`/api/v1/datasets/${virtual.id}/permissions`, [...parentPermissions, { classes: ['list', 'read'] }])
    const testUser1 = await axiosAuth('test_user1@test.com')
    await assert.rejects(testUser1.post('/api/v1/datasets', { isRest: true, title: 'f', partOf: { type: 'dataset', id: virtual.id } }), { status: 400 })
    // parent is itself a fragment
    const fragment = (await testUser1Org.post('/api/v1/datasets', { isVirtual: true, title: 'f', partOf: { type: 'dataset', id: virtual.id } })).data
    await assert.rejects(testUser1Org.post('/api/v1/datasets', { isRest: true, title: 'f2', partOf: { type: 'dataset', id: fragment.id } }), { status: 400 })
  })

  test('read-only access to the virtual dataset does not grant direct read on the fragment, data flows through the virtual dataset', async () => {
    const virtual = await createVirtual()
    const fragment = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: virtual.id } })
    await testUser1Org.patch(`/api/v1/datasets/${virtual.id}`, { virtual: { children: [fragment.id] }, schema: [{ key: 'id' }] })
    await waitForFinalize(testUser1Org, virtual.id)
    const parentPermissions = (await testUser1Org.get(`/api/v1/datasets/${virtual.id}/permissions`)).data
    await testUser1Org.put(`/api/v1/datasets/${virtual.id}/permissions`, [...parentPermissions, { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['list', 'read'] }])
    const lines = (await testUser3.get(`/api/v1/datasets/${virtual.id}/lines`)).data
    assert.ok(lines.total > 0)
    await assert.rejects(testUser3.get(`/api/v1/datasets/${fragment.id}`), { status: 403 })
    await assert.rejects(testUser3.get(`/api/v1/datasets/${fragment.id}/lines`), { status: 403 })
  })

  test('write access to the virtual dataset grants read and write on the fragment', async () => {
    const virtual = await createVirtual()
    const fragment = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: virtual.id } })
    const parentPermissions = (await testUser1Org.get(`/api/v1/datasets/${virtual.id}/permissions`)).data
    await testUser1Org.put(`/api/v1/datasets/${virtual.id}/permissions`, [...parentPermissions, { type: 'user', id: 'test_user3', name: 'Test User3', classes: ['write'] }])
    const res = await testUser3.get(`/api/v1/datasets/${fragment.id}`)
    assert.ok(res.data.userPermissions.includes('readLines'))
    await testUser3.patch(`/api/v1/datasets/${fragment.id}`, { title: 'renamed by test_user3' })
  })

  test('attach an existing dataset, then detach it keeping its ACL', async () => {
    const virtual = await createVirtual()
    const plain = await sendDataset('datasets/dataset1.csv', testUser1Org)
    // contributors cannot attach (changeOwner gate)
    await assert.rejects(testUser5Org.patch(`/api/v1/datasets/${plain.id}`, { partOf: { type: 'dataset', id: virtual.id } }), { status: 403 })
    let res = await testUser1Org.patch(`/api/v1/datasets/${plain.id}`, { partOf: { type: 'dataset', id: virtual.id } })
    assert.deepEqual(res.data.partOf, { type: 'dataset', id: virtual.id })
    let permissions = (await testUser1Org.get(`/api/v1/datasets/${plain.id}/permissions`)).data
    assert.deepEqual(permissions[0].classes, ['list', 'read', 'readAdvanced', 'write'])
    // re-parenting is refused
    const virtual2 = await createVirtual()
    await assert.rejects(testUser1Org.patch(`/api/v1/datasets/${plain.id}`, { partOf: { type: 'dataset', id: virtual2.id } }), { status: 400 })
    // a fragment cannot be published nor have its ACL / owner changed
    await assert.rejects(testUser1Org.patch(`/api/v1/datasets/${plain.id}`, { publicationSites: [] }), { status: 400 })
    await assert.rejects(testUser1Org.put(`/api/v1/datasets/${plain.id}/permissions`, []), { status: 403 })
    await assert.rejects(testUser1Org.put(`/api/v1/datasets/${plain.id}/owner`, { type: 'user', id: 'test_user1', name: 'Test User1' }), { status: 403 })
    // the parent cannot change owner while it has fragments
    await assert.rejects(testUser1Org.put(`/api/v1/datasets/${virtual.id}/owner`, { type: 'user', id: 'test_user1', name: 'Test User1' }), { status: 400 })
    // detach keeps the ACL as it is and re-opens ACL edition
    res = await testUser1Org.patch(`/api/v1/datasets/${plain.id}`, { partOf: null })
    assert.equal(res.data.partOf, undefined)
    permissions = (await testUser1Org.get(`/api/v1/datasets/${plain.id}/permissions`)).data
    assert.deepEqual(permissions[0].classes, ['list', 'read', 'readAdvanced', 'write'])
    await testUser1Org.put(`/api/v1/datasets/${plain.id}/permissions`, [])
    await testUser1Org.put(`/api/v1/datasets/${virtual.id}/owner`, { type: 'user', id: 'test_user1', name: 'Test User1' })
  })

  test('a resource that has fragments cannot become a fragment', async () => {
    const virtual = await createVirtual()
    await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: virtual.id } })
    const virtual2 = await createVirtual()
    await assert.rejects(testUser1Org.patch(`/api/v1/datasets/${virtual.id}`, { partOf: { type: 'dataset', id: virtual2.id } }), { status: 400 })
  })
})
