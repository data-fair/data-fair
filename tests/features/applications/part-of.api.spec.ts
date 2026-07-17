import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser3 = await axiosAuth('test_user3@test.com')
// test_user1 is admin of test_org1, test_user5 is a contributor of it (dev/resources/organizations.json).
const testOrg1Admin = await axiosAuth('test_user1@test.com', 'test_org1')
const testOrg1Contrib = await axiosAuth('test_user5@test.com', 'test_org1')

test.describe('application partOf attribute', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('cannot define an application as a child when it is used by no parent at all', async () => {
    const ax = testUser1
    const { data: childApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const { data: parentApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })

    await assert.rejects(
      ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { type: 'application', id: parentApp.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('cannot define an application as its own child', async () => {
    const ax = testUser1
    const { data: app } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await assert.rejects(
      ax.patch(`/api/v1/applications/${app.id}`, { partOf: { type: 'application', id: app.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('cannot define an application as a child when it is embedded by more than one parent', async () => {
    const ax = testUser1
    const { data: childApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const childRef = (await ax.get('/api/v1/applications', { params: { id: childApp.id, select: 'id' } })).data.results[0]

    const { data: parent1 } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await ax.put(`/api/v1/applications/${parent1.id}/config`, { applications: [{ id: childApp.id, href: childRef.href }] })
    const { data: parent2 } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await ax.put(`/api/v1/applications/${parent2.id}/config`, { applications: [{ id: childApp.id, href: childRef.href }] })

    await assert.rejects(
      ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { type: 'application', id: parent1.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('cannot define an application as a child of an application that is itself a child', async () => {
    const ax = testUser1
    const { data: appC } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const refC = (await ax.get('/api/v1/applications', { params: { id: appC.id, select: 'id' } })).data.results[0]
    const { data: appB } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const refB = (await ax.get('/api/v1/applications', { params: { id: appB.id, select: 'id' } })).data.results[0]
    const { data: appA } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })

    await ax.put(`/api/v1/applications/${appB.id}/config`, { applications: [{ id: appC.id, href: refC.href }] })
    await ax.put(`/api/v1/applications/${appA.id}/config`, { applications: [{ id: appB.id, href: refB.href }] })
    // B becomes a child of A (C is referenced by B's config but not partOf-defined yet, B has no children)
    await ax.patch(`/api/v1/applications/${appB.id}`, { partOf: { type: 'application', id: appA.id } })

    // B is itself a child: C cannot be defined as a child of B
    await assert.rejects(
      ax.patch(`/api/v1/applications/${appC.id}`, { partOf: { type: 'application', id: appB.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('cannot define an application as a child when it already has partOf children of its own', async () => {
    const ax = testUser1
    const { data: appC } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const refC = (await ax.get('/api/v1/applications', { params: { id: appC.id, select: 'id' } })).data.results[0]
    const childDataset = await sendDataset('datasets/dataset1.csv', ax)
    const childDatasetRef = (await ax.get('/api/v1/datasets', { params: { id: childDataset.id, select: 'id' } })).data.results[0]
    const { data: appB } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const refB = (await ax.get('/api/v1/applications', { params: { id: appB.id, select: 'id' } })).data.results[0]
    const { data: appA } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })

    await ax.put(`/api/v1/applications/${appB.id}/config`, {
      applications: [{ id: appC.id, href: refC.href }],
      datasets: [{ id: childDataset.id, href: childDatasetRef.href }]
    })
    await ax.put(`/api/v1/applications/${appA.id}/config`, { applications: [{ id: appB.id, href: refB.href }] })

    // child application case: C is a child of B → B cannot become a child of A
    await ax.patch(`/api/v1/applications/${appC.id}`, { partOf: { type: 'application', id: appB.id } })
    await assert.rejects(
      ax.patch(`/api/v1/applications/${appB.id}`, { partOf: { type: 'application', id: appA.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )

    // child dataset case: release C, define the dataset as B's child instead → same rejection
    await ax.patch(`/api/v1/applications/${appC.id}`, { partOf: null })
    await ax.patch(`/api/v1/datasets/${childDataset.id}`, { partOf: { type: 'application', id: appB.id } })
    await assert.rejects(
      ax.patch(`/api/v1/applications/${appB.id}`, { partOf: { type: 'application', id: appA.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('can define, denormalizes the parent title, hides it from the default listing, and can un-define', async () => {
    const ax = testUser1
    const { data: childApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const childRef = (await ax.get('/api/v1/applications', { params: { id: childApp.id, select: 'id' } })).data.results[0]
    const { data: parentApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await ax.put(`/api/v1/applications/${parentApp.id}/config`, { applications: [{ id: childApp.id, href: childRef.href }] })

    let res = await ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { type: 'application', id: parentApp.id, title: 'stale title sent by the client' } })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.partOf, { type: 'application', id: parentApp.id, title: parentApp.title })

    // hidden from the default listing, without needing any filter param...
    res = await ax.get('/api/v1/applications')
    assert.ok(!res.data.results.find((a: any) => a.id === childApp.id))
    // ...the only way to see it is to explicitly ask for children...
    res = await ax.get('/api/v1/applications', { params: { partOf: 'true' } })
    assert.ok(res.data.results.find((a: any) => a.id === childApp.id))
    // ...or to look up the children of that specific parent
    res = await ax.get('/api/v1/applications', { params: { partOf: parentApp.id } })
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results[0].id, childApp.id)

    res = await ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: null })
    assert.equal(res.status, 200)
    assert.equal(res.data.partOf, undefined)
    res = await ax.get('/api/v1/applications')
    assert.ok(res.data.results.find((a: any) => a.id === childApp.id))
  })

  test('setting or unsetting partOf requires admin permission on the application, not just write', async () => {
    const ax = testUser1
    const { data: app } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await ax.put(`/api/v1/applications/${app.id}/permissions`, [{ classes: ['write'], type: 'user', id: 'test_user3' }])

    await assert.rejects(
      testUser3.patch(`/api/v1/applications/${app.id}`, { partOf: null }),
      (err: any) => {
        assert.equal(err.status, 403)
        return true
      }
    )
  })

  test('a configuration write that drops defined children requires an explicit childrenAction, only orphans are affected', async () => {
    const ax = testUser1
    const { data: childApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const childAppRef = (await ax.get('/api/v1/applications', { params: { id: childApp.id, select: 'id' } })).data.results[0]
    const childDataset = await sendDataset('datasets/dataset1.csv', ax)
    const childDatasetRef = (await ax.get('/api/v1/datasets', { params: { id: childDataset.id, select: 'id' } })).data.results[0]
    const { data: parentApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await ax.put(`/api/v1/applications/${parentApp.id}/config`, {
      applications: [{ id: childApp.id, href: childAppRef.href }],
      datasets: [{ id: childDataset.id, href: childDatasetRef.href }]
    })
    await ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { type: 'application', id: parentApp.id } })
    await ax.patch(`/api/v1/datasets/${childDataset.id}`, { partOf: { type: 'application', id: parentApp.id } })

    // dropping the child app from the config (PUT /config) without childrenAction → 409
    await assert.rejects(
      ax.put(`/api/v1/applications/${parentApp.id}/config`, { datasets: [{ id: childDataset.id, href: childDatasetRef.href }] }),
      (err: any) => {
        assert.equal(err.status, 409)
        return true
      }
    )
    // nothing was applied
    let res = await ax.get(`/api/v1/applications/${childApp.id}`)
    assert.deepEqual(res.data.partOf, { type: 'application', id: parentApp.id, title: parentApp.title })

    // retry with unflag: childApp is released, childDataset (still referenced) is untouched
    res = await ax.put(`/api/v1/applications/${parentApp.id}/config`, { datasets: [{ id: childDataset.id, href: childDatasetRef.href }] }, { params: { childrenAction: 'unflag' } })
    assert.equal(res.status, 200)
    res = await ax.get(`/api/v1/applications/${childApp.id}`)
    assert.equal(res.data.partOf, undefined)
    res = await ax.get(`/api/v1/datasets/${childDataset.id}`)
    assert.deepEqual(res.data.partOf, { type: 'application', id: parentApp.id, title: parentApp.title })

    // dropping the child dataset through PATCH configuration: 409 then cascade delete
    await assert.rejects(
      ax.patch(`/api/v1/applications/${parentApp.id}`, { configuration: { datasets: [] } }),
      (err: any) => {
        assert.equal(err.status, 409)
        return true
      }
    )
    res = await ax.patch(`/api/v1/applications/${parentApp.id}`, { configuration: { datasets: [] } }, { params: { childrenAction: 'delete' } })
    assert.equal(res.status, 200)
    await assert.rejects(
      ax.get(`/api/v1/datasets/${childDataset.id}`),
      (err: any) => {
        assert.equal(err.status, 404)
        return true
      }
    )
  })

  test('a full-replace PUT preserves partOf and guards its configuration', async () => {
    const ax = testUser1
    const { data: childApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const childRef = (await ax.get('/api/v1/applications', { params: { id: childApp.id, select: 'id' } })).data.results[0]
    const { data: parentApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await ax.put(`/api/v1/applications/${parentApp.id}/config`, { applications: [{ id: childApp.id, href: childRef.href }] })
    await ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { type: 'application', id: parentApp.id } })

    // a PUT on the child that omits partOf does not drop it
    let res = await ax.put(`/api/v1/applications/${childApp.id}`, { url: mockAppUrl('monapp1'), title: 'child replaced' })
    assert.equal(res.status, 200)
    res = await ax.get(`/api/v1/applications/${childApp.id}`)
    assert.deepEqual(res.data.partOf, { type: 'application', id: parentApp.id, title: parentApp.title })

    // a PUT cannot inject an arbitrary partOf either
    const { data: otherApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    res = await ax.put(`/api/v1/applications/${otherApp.id}`, { url: mockAppUrl('monapp1'), title: 'other replaced', partOf: { type: 'application', id: parentApp.id } })
    assert.equal(res.status, 200)
    res = await ax.get(`/api/v1/applications/${otherApp.id}`)
    assert.equal(res.data.partOf, undefined)

    // a PUT on the parent that drops the child from its configuration is guarded
    await assert.rejects(
      ax.put(`/api/v1/applications/${parentApp.id}`, { url: mockAppUrl('monapp1'), title: 'parent replaced', configuration: {} }),
      (err: any) => {
        assert.equal(err.status, 409)
        return true
      }
    )
    res = await ax.put(`/api/v1/applications/${parentApp.id}`, { url: mockAppUrl('monapp1'), title: 'parent replaced', configuration: {} }, { params: { childrenAction: 'unflag' } })
    assert.equal(res.status, 200)
    res = await ax.get(`/api/v1/applications/${childApp.id}`)
    assert.equal(res.data.partOf, undefined)
  })

  test('deleting a parent application with defined children (app and dataset) requires an explicit childrenAction', async () => {
    const ax = testUser1

    const { data: childApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const childRef = (await ax.get('/api/v1/applications', { params: { id: childApp.id, select: 'id' } })).data.results[0]
    const childDataset = await sendDataset('datasets/dataset1.csv', ax)
    const childDatasetRef = (await ax.get('/api/v1/datasets', { params: { id: childDataset.id, select: 'id' } })).data.results[0]

    const { data: parentApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await ax.put(`/api/v1/applications/${parentApp.id}/config`, {
      applications: [{ id: childApp.id, href: childRef.href }],
      datasets: [{ id: childDataset.id, href: childDatasetRef.href }]
    })

    await ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { type: 'application', id: parentApp.id } })
    await ax.patch(`/api/v1/datasets/${childDataset.id}`, { partOf: { type: 'application', id: parentApp.id } })

    await assert.rejects(
      ax.delete(`/api/v1/applications/${parentApp.id}`),
      (err: any) => {
        assert.equal(err.status, 409)
        return true
      }
    )

    const res = await ax.delete(`/api/v1/applications/${parentApp.id}`, { params: { childrenAction: 'unflag' } })
    assert.equal(res.status, 204)

    const appRes = await ax.get(`/api/v1/applications/${childApp.id}`)
    assert.equal(appRes.data.partOf, undefined)
    const datasetRes = await ax.get(`/api/v1/datasets/${childDataset.id}`)
    assert.equal(datasetRes.data.partOf, undefined)
  })

  test('a still-referenced child identified only by href is not treated as an orphan', async () => {
    const ax = testUser1
    const childA = await sendDataset('datasets/dataset1.csv', ax)
    const childARef = (await ax.get('/api/v1/datasets', { params: { id: childA.id, select: 'id' } })).data.results[0]
    const childB = await sendDataset('datasets/dataset1.csv', ax)
    const childBRef = (await ax.get('/api/v1/datasets', { params: { id: childB.id, select: 'id' } })).data.results[0]

    const { data: parentApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    // both children are initially referenced with an id, so each qualifies as used by exactly one parent
    await ax.put(`/api/v1/applications/${parentApp.id}/config`, {
      datasets: [{ id: childA.id, href: childARef.href }, { id: childB.id, href: childBRef.href }]
    })

    await ax.patch(`/api/v1/datasets/${childA.id}`, { partOf: { type: 'application', id: parentApp.id } })
    await ax.patch(`/api/v1/datasets/${childB.id}`, { partOf: { type: 'application', id: parentApp.id } })

    // drop childB entirely from the config, keep childA but referenced by href only (no id) -> only childB is an orphan
    const res = await ax.put(`/api/v1/applications/${parentApp.id}/config`, {
      datasets: [{ href: childARef.href }]
    }, { params: { childrenAction: 'unflag' } })
    assert.equal(res.status, 200)

    const datasetBRes = await ax.get(`/api/v1/datasets/${childB.id}`)
    assert.equal(datasetBRes.data.partOf, undefined)

    // childA is still referenced (by href only) and must keep its partOf
    const datasetARes = await ax.get(`/api/v1/datasets/${childA.id}`)
    assert.deepEqual(datasetARes.data.partOf, { type: 'application', id: parentApp.id, title: parentApp.title })
  })

  test('a rejected patch does not cascade the deletion of the children it would have orphaned', async () => {
    const ax = testUser1
    const { data: childApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const childRef = (await ax.get('/api/v1/applications', { params: { id: childApp.id, select: 'id' } })).data.results[0]
    const { data: parentApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const { data: conflicting } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'conflicting app' })
    await ax.put(`/api/v1/applications/${parentApp.id}/config`, { applications: [{ id: childApp.id, href: childRef.href }] })
    await ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { type: 'application', id: parentApp.id } })

    // the patch drops the child from the configuration AND takes an already-used slug: it is rejected
    await assert.rejects(
      ax.patch(`/api/v1/applications/${parentApp.id}`, { configuration: {}, slug: conflicting.slug }, { params: { childrenAction: 'delete' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )

    // the request failed, so the child must still be there, still flagged
    const res = await ax.get(`/api/v1/applications/${childApp.id}`)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.partOf, { type: 'application', id: parentApp.id, title: parentApp.title })
  })

  test('an application can be created directly as a child of an eligible parent', async () => {
    const ax = testUser1
    const { data: parentApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })

    const res = await ax.post('/api/v1/applications', {
      url: mockAppUrl('monapp1'),
      title: 'a child created from its parent',
      partOf: { type: 'application', id: parentApp.id, title: 'stale title sent by the client' }
    })
    assert.equal(res.status, 201)
    assert.deepEqual(res.data.partOf, { type: 'application', id: parentApp.id, title: parentApp.title })

    const list = await ax.get('/api/v1/applications')
    assert.ok(!list.data.results.find((a: any) => a.id === res.data.id))
  })

  test('cannot create an application as a child of a parent belonging to another account', async () => {
    const ax = testUser1
    const axOrg = await axiosAuth('test_user1@test.com', 'test_org1')
    const { data: parentApp } = await axOrg.post('/api/v1/applications', { url: mockAppUrl('monapp1') })

    await assert.rejects(
      ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), partOf: { type: 'application', id: parentApp.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('an application defined as a child cannot change account on its own, a parent migrates its children', async () => {
    const ax = testUser1
    const { data: childApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const childRef = (await ax.get('/api/v1/applications', { params: { id: childApp.id, select: 'id' } })).data.results[0]
    const childDataset = await sendDataset('datasets/dataset1.csv', ax)
    const childDatasetRef = (await ax.get('/api/v1/datasets', { params: { id: childDataset.id, select: 'id' } })).data.results[0]

    const { data: parentApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await ax.put(`/api/v1/applications/${parentApp.id}/config`, {
      applications: [{ id: childApp.id, href: childRef.href }],
      datasets: [{ id: childDataset.id, href: childDatasetRef.href }]
    })
    await ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { type: 'application', id: parentApp.id } })
    await ax.patch(`/api/v1/datasets/${childDataset.id}`, { partOf: { type: 'application', id: parentApp.id } })

    const newOwner = { type: 'organization', id: 'test_org1', name: 'Test Org 1' }
    await assert.rejects(
      ax.put(`/api/v1/applications/${childApp.id}/owner`, newOwner),
      (err: any) => {
        assert.equal(err.status, 409)
        return true
      }
    )

    // the applications change-owner route requires the new owner to be the active account, an
    // admin session is the simplest way to move a personal application to an organization
    const axAdmin = await axiosAuth('test_superadmin@test.com', undefined, true)
    const res = await axAdmin.put(`/api/v1/applications/${parentApp.id}/owner`, newOwner)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.owner, newOwner)

    // both kinds of children followed their parent
    assert.deepEqual((await axAdmin.get(`/api/v1/applications/${childApp.id}`)).data.owner, newOwner)
    assert.deepEqual((await axAdmin.get(`/api/v1/datasets/${childDataset.id}`)).data.owner, newOwner)
  })

  test('partOf must designate its parent by type and id', async () => {
    const ax = testUser1
    const { data: childApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const childRef = (await ax.get('/api/v1/applications', { params: { id: childApp.id, select: 'id' } })).data.results[0]
    const { data: parentApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await ax.put(`/api/v1/applications/${parentApp.id}/config`, { applications: [{ id: childApp.id, href: childRef.href }] })

    // missing type: rejected by schema validation, it is required
    await assert.rejects(
      ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { id: parentApp.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
    // the type is part of the ref: 'dataset' passes schema validation (no type is forbidden a priori)
    // but designates a resource that does not use this one
    await assert.rejects(
      ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { type: 'dataset', id: parentApp.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
    // the designated parent is the one that references it
    const res = await ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { type: 'application', id: parentApp.id } })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.partOf, { type: 'application', id: parentApp.id, title: parentApp.title })
  })

  test('an organization contributor can create an application as a child of a parent it can configure', async () => {
    const { data: parentApp } = await testOrg1Admin.post('/api/v1/applications', { url: mockAppUrl('monapp1') })

    const res = await testOrg1Contrib.post('/api/v1/applications', {
      url: mockAppUrl('monapp1'),
      title: 'a child created by a contributor',
      partOf: { type: 'application', id: parentApp.id }
    })
    assert.equal(res.status, 201)
    assert.deepEqual(res.data.partOf, { type: 'application', id: parentApp.id, title: parentApp.title })
  })

  test('creating an application as a child accepts writeDescription alone, PATCH configuration is not hardened', async () => {
    const { data: parentApp } = await testOrg1Admin.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    // PATCH /applications/:id with a configuration body is gated by writeDescription, not writeConfig,
    // so writeDescription alone is enough to make the parent reference a child
    await testOrg1Admin.put(`/api/v1/applications/${parentApp.id}/permissions`, [
      { type: 'organization', id: 'test_org1', roles: ['contrib'], operations: ['readDescription', 'writeDescription'] }
    ])

    const res = await testOrg1Contrib.post('/api/v1/applications', {
      url: mockAppUrl('monapp1'),
      title: 'a child',
      partOf: { type: 'application', id: parentApp.id }
    })
    assert.equal(res.status, 201)
    assert.deepEqual(res.data.partOf, { type: 'application', id: parentApp.id, title: parentApp.title })
  })

  test('creating an application as a child requires a write operation on the parent, reading it is not enough', async () => {
    const { data: parentApp } = await testOrg1Admin.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await testOrg1Admin.put(`/api/v1/applications/${parentApp.id}/permissions`, [
      { type: 'organization', id: 'test_org1', roles: ['contrib'], classes: ['read'] }
    ])

    await assert.rejects(
      testOrg1Contrib.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'a child', partOf: { type: 'application', id: parentApp.id } }),
      (err: any) => {
        assert.equal(err.status, 403)
        return true
      }
    )
  })
})
