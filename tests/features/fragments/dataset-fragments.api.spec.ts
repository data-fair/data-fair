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

// a virtual dataset re-finalizes on its own after a children change: wait for that settled state
// (a journal wait could miss an event that already happened)
const waitVirtualSettled = async (virtualId: string, children: string[]) => {
  for (let i = 0; i < 100; i++) {
    const virtual = (await testUser1Org.get(`/api/v1/datasets/${virtualId}`)).data
    if (virtual.status === 'finalized' && JSON.stringify(virtual.virtual.children) === JSON.stringify(children)) return virtual
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`virtual dataset ${virtualId} did not settle with children ${children.join(',')}`)
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

  test('a new fragment of a virtual dataset is not one of its sources until explicitly added', async () => {
    const virtual = await createVirtual()
    const fragment = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: virtual.id } })
    // it may need setup and checks first: joining the parent's children is the user's decision
    assert.deepEqual((await testUser1Org.get(`/api/v1/datasets/${virtual.id}`)).data.virtual.children, [])
    await testUser1Org.patch(`/api/v1/datasets/${virtual.id}`, { virtual: { children: [fragment.id] } })
    await waitVirtualSettled(virtual.id, [fragment.id])
  })

  test('a rest fragment initialized from its virtual parent gets its columns', async () => {
    const virtual = await createVirtual()
    const fileFragment = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: virtual.id } })
    await testUser1Org.patch(`/api/v1/datasets/${virtual.id}`, { virtual: { children: [fileFragment.id] }, schema: [{ key: 'id' }, { key: 'adr' }] })
    await waitVirtualSettled(virtual.id, [fileFragment.id])
    const restFragment = (await testUser1Org.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest fragment',
      initFrom: { dataset: virtual.id, parts: ['schema'] },
      partOf: { type: 'dataset', id: virtual.id }
    })).data
    const finalized = await waitForFinalize(testUser1Org, restFragment.id)
    assert.deepEqual(finalized.schema.filter((p: any) => !p['x-calculated']).map((p: any) => p.key), ['id', 'adr'])
    assert.deepEqual((await testUser1Org.get(`/api/v1/datasets/${virtual.id}`)).data.virtual.children, [fileFragment.id])
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

  test('reference data can neither be attached nor declared on a fragment', async () => {
    const virtual = await createVirtual()
    const masterData = { virtualDatasets: { active: true } }

    // a reference dataset exists to be reused across contexts, it cannot also die with one parent
    const reference = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { masterData })
    await assert.rejects(testUser1Org.patch(`/api/v1/datasets/${reference.id}`, { partOf: { type: 'dataset', id: virtual.id } }), { status: 400 })
    // an empty master-data sub-object is not reference data
    const plain = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { masterData: {} })
    assert.equal((await testUser1Org.patch(`/api/v1/datasets/${plain.id}`, { partOf: { type: 'dataset', id: virtual.id } })).status, 200)

    // and the reciprocal, or the refusal above would be bypassed by attaching first
    const fragment = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: virtual.id } })
    await assert.rejects(testUser1Org.patch(`/api/v1/datasets/${fragment.id}`, { masterData }), { status: 400 })
    assert.equal((await testUser1Org.patch(`/api/v1/datasets/${fragment.id}`, { masterData: {} })).status, 200)
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

  // POST /api/v1/datasets/:datasetId (and its PUT twin) shares the patch-req schema with PATCH but
  // writes its body straight through preparePatch -> applyPatch's $set. Without the shared write
  // guard, `partOf` landed there raw: no changeOwner gate (this route is gated on writeData/write,
  // which a parent's CONTRIBUTOR holds through the derived entry), no parent validation, no derived
  // ACL replacement — so a fragment could be detached, or an arbitrary dataset attached, by anyone
  // who can merely write it. Parentage is changed by PATCH only.
  test('POST /:datasetId cannot change partOf', async () => {
    const virtual = await createVirtual()
    const fragment = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: virtual.id } })
    // the contributor holds write on the fragment through the derived ACL, but not changeOwner
    assert.ok((await testUser5Org.get(`/api/v1/datasets/${fragment.id}`)).data.userPermissions.includes('writeDescription'))
    await assert.rejects(testUser5Org.post(`/api/v1/datasets/${fragment.id}`, { partOf: null }), { status: 400 })
    // nor can an admin: this route is simply not the way to detach
    await assert.rejects(testUser1Org.post(`/api/v1/datasets/${fragment.id}`, { partOf: null }), { status: 400 })
    assert.deepEqual((await testUser1Org.get(`/api/v1/datasets/${fragment.id}`)).data.partOf, { type: 'dataset', id: virtual.id })

    // and a plain dataset cannot be attached through it either
    const plain = await sendDataset('datasets/dataset1.csv', testUser1Org)
    await assert.rejects(testUser5Org.post(`/api/v1/datasets/${plain.id}`, { partOf: { type: 'dataset', id: virtual.id } }), { status: 400 })
    await assert.rejects(testUser1Org.post(`/api/v1/datasets/${plain.id}`, { partOf: { type: 'dataset', id: virtual.id } }), { status: 400 })
    assert.equal((await testUser1Org.get(`/api/v1/datasets/${plain.id}`)).data.partOf, undefined)

    // a full-document round trip that echoes the unchanged partOf is still accepted
    const res = await testUser1Org.post(`/api/v1/datasets/${fragment.id}`, { title: 'renamed', partOf: { type: 'dataset', id: virtual.id } })
    assert.equal(res.status, 200)
    assert.equal((await testUser1Org.get(`/api/v1/datasets/${fragment.id}`)).data.title, 'renamed')

    // the publication refusal applies on this route too, not only on PATCH
    await assert.rejects(testUser1Org.post(`/api/v1/datasets/${fragment.id}`, { publicationSites: [] }), { status: 400 })
  })

  test('a resource that has fragments cannot become a fragment', async () => {
    const virtual = await createVirtual()
    await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: virtual.id } })
    const virtual2 = await createVirtual()
    await assert.rejects(testUser1Org.patch(`/api/v1/datasets/${virtual.id}`, { partOf: { type: 'dataset', id: virtual2.id } }), { status: 400 })
  })

  test('deleting the parent deletes its fragments', async () => {
    const virtual = await createVirtual()
    const fragment = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: virtual.id } })
    await testUser1Org.delete(`/api/v1/datasets/${virtual.id}`)
    await assert.rejects(testUser1Org.get(`/api/v1/datasets/${fragment.id}`), { status: 404 })
  })
})
