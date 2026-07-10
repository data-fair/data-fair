import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'
import { sendDataset, waitForFinalize, waitForDatasetError } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser3 = await axiosAuth('test_user3@test.com')
// test_user1 is admin of test_org1, test_user5 is a contributor of it (dev/resources/organizations.json).
// Contributors get the `write` class on every resource of the org through initResourcePermissions, never `admin`.
const testOrg1Admin = await axiosAuth('test_user1@test.com', 'test_org1')
const testOrg1Contrib = await axiosAuth('test_user5@test.com', 'test_org1')

test.describe('dataset partOf attribute', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('cannot define a dataset as a child when it is used by no parent at all', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset' })
    // an empty virtual dataset (no children) errors out, it is not a "not queryable" success case
    await waitForDatasetError(ax, virtualRes.data.id)
    const virtualDataset = virtualRes.data

    await assert.rejects(
      ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('cannot define a dataset as its own child', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await assert.rejects(
      ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'dataset', id: dataset.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('cannot define a virtual dataset as a child, even when it has a single parent', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const innerRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'inner virtual', virtual: { children: [dataset.id] } })
    const innerVirtual = await waitForFinalize(ax, innerRes.data.id)
    const outerRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'outer virtual', virtual: { children: [innerVirtual.id] } })
    await waitForFinalize(ax, outerRes.data.id)

    // innerVirtual is used by exactly one parent, but virtual datasets can never be children
    await assert.rejects(
      ax.patch(`/api/v1/datasets/${innerVirtual.id}`, { partOf: { type: 'dataset', id: outerRes.data.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('cannot define a dataset as a child of an application that is itself a child', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const datasetRef = (await ax.get('/api/v1/datasets', { params: { id: dataset.id, select: 'id' } })).data.results[0]

    const { data: parentApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const parentRef = (await ax.get('/api/v1/applications', { params: { id: parentApp.id, select: 'id' } })).data.results[0]
    await ax.put(`/api/v1/applications/${parentApp.id}/config`, { datasets: [{ id: dataset.id, href: datasetRef.href }] })

    const { data: grandParent } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await ax.put(`/api/v1/applications/${grandParent.id}/config`, { applications: [{ id: parentApp.id, href: parentRef.href }] })
    await ax.patch(`/api/v1/applications/${parentApp.id}`, { partOf: { type: 'application', id: grandParent.id } })

    // parentApp is now itself a child: chaining through it is not allowed
    await assert.rejects(
      ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'application', id: parentApp.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('cannot define a dataset as a child when it is used by more than one parent', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const virtual1 = await waitForFinalize(ax, (await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'virtual 1',
      virtual: { children: [dataset.id] }
    })).data.id)
    const virtual2 = await waitForFinalize(ax, (await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'virtual 2',
      virtual: { children: [dataset.id] }
    })).data.id)

    // used by 2 virtual datasets at once: ambiguous, cannot be defined as a child of either
    await assert.rejects(
      ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'dataset', id: virtual1.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
    await assert.rejects(
      ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'dataset', id: virtual2.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('can define, denormalizes the parent title, hides it from the default listing, and can un-define', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', {
      isVirtual: true,
      title: 'a virtual dataset',
      virtual: { children: [dataset.id] }
    })
    const virtualDataset = await waitForFinalize(ax, virtualRes.data.id)

    let res = await ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'dataset', id: virtualDataset.id, title: 'stale title sent by the client' } })
    assert.equal(res.status, 200)
    // the parent's title is always denormalized server-side, the client-sent value is ignored
    assert.deepEqual(res.data.partOf, { type: 'dataset', id: virtualDataset.id, title: virtualDataset.title })

    // hidden from the default listing, without needing any filter param...
    res = await ax.get('/api/v1/datasets')
    assert.ok(!res.data.results.find((d: any) => d.id === dataset.id))
    // ...the only way to see it is to explicitly ask for children...
    res = await ax.get('/api/v1/datasets', { params: { partOf: 'true' } })
    assert.ok(res.data.results.find((d: any) => d.id === dataset.id))
    // ...or to look up the children of that specific parent
    res = await ax.get('/api/v1/datasets', { params: { partOf: virtualDataset.id } })
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results[0].id, dataset.id)
    // ...a lookup by known id is never filtered
    res = await ax.get('/api/v1/datasets', { params: { id: dataset.id } })
    assert.equal(res.data.count, 1)

    // can be un-defined at any time, no eligibility condition applies
    res = await ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: null })
    assert.equal(res.status, 200)
    // the immediate patch response reflects the in-memory merge (null), a fresh read shows it fully absent
    assert.equal(res.data.partOf, null)
    res = await ax.get(`/api/v1/datasets/${dataset.id}`)
    assert.equal(res.data.partOf, undefined)
    res = await ax.get('/api/v1/datasets')
    assert.ok(res.data.results.find((d: any) => d.id === dataset.id))
  })

  test('a dataset can be defined as a child of the single application that uses it', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const datasetRef = (await ax.get('/api/v1/datasets', { params: { id: dataset.id, select: 'id' } })).data.results[0]

    const { data: app } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await ax.put(`/api/v1/applications/${app.id}/config`, { datasets: [{ id: dataset.id, href: datasetRef.href }] })

    const res = await ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'application', id: app.id } })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.partOf, { type: 'application', id: app.id, title: app.title })
  })

  test('setting or unsetting partOf requires admin permission on the dataset, not just write', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [{ classes: ['write'], type: 'user', id: 'test_user3' }])

    await assert.rejects(
      testUser3.patch(`/api/v1/datasets/${dataset.id}`, { partOf: null }),
      (err: any) => {
        assert.equal(err.status, 403)
        return true
      }
    )
  })

  test('removing a defined child from a virtual dataset requires an explicit childrenAction, only orphans are affected', async () => {
    const ax = testUser1
    const child1 = await sendDataset('datasets/dataset1.csv', ax)
    const child2 = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'virtual parent', virtual: { children: [child1.id, child2.id] } })
    const virtualDataset = await waitForFinalize(ax, virtualRes.data.id)
    await ax.patch(`/api/v1/datasets/${child1.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } })
    await ax.patch(`/api/v1/datasets/${child2.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } })

    // dropping child1 from the members without an explicit childrenAction is refused
    await assert.rejects(
      ax.patch(`/api/v1/datasets/${virtualDataset.id}`, { virtual: { children: [child2.id] } }),
      (err: any) => {
        assert.equal(err.status, 409)
        return true
      }
    )
    // nothing was applied
    let res = await ax.get(`/api/v1/datasets/${child1.id}`)
    assert.deepEqual(res.data.partOf, { type: 'dataset', id: virtualDataset.id, title: virtualDataset.title })

    // unflag: only the dropped child is affected
    res = await ax.patch(`/api/v1/datasets/${virtualDataset.id}`, { virtual: { children: [child2.id] } }, { params: { childrenAction: 'unflag' } })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, virtualDataset.id)
    res = await ax.get(`/api/v1/datasets/${child1.id}`)
    assert.equal(res.data.partOf, undefined)
    res = await ax.get(`/api/v1/datasets/${child2.id}`)
    assert.deepEqual(res.data.partOf, { type: 'dataset', id: virtualDataset.id, title: virtualDataset.title })
  })

  test('removing a defined child from a virtual dataset with childrenAction=delete cascades to the orphan only', async () => {
    const ax = testUser1
    const child1 = await sendDataset('datasets/dataset1.csv', ax)
    const child2 = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'virtual parent', virtual: { children: [child1.id, child2.id] } })
    const virtualDataset = await waitForFinalize(ax, virtualRes.data.id)
    await ax.patch(`/api/v1/datasets/${child1.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } })
    await ax.patch(`/api/v1/datasets/${child2.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } })

    const res = await ax.patch(`/api/v1/datasets/${virtualDataset.id}`, { virtual: { children: [child2.id] } }, { params: { childrenAction: 'delete' } })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, virtualDataset.id)
    await assert.rejects(
      ax.get(`/api/v1/datasets/${child1.id}`),
      (err: any) => {
        assert.equal(err.status, 404)
        return true
      }
    )
    const res2 = await ax.get(`/api/v1/datasets/${child2.id}`)
    assert.deepEqual(res2.data.partOf, { type: 'dataset', id: virtualDataset.id, title: virtualDataset.title })
  })

  test('deleting a virtual dataset with a defined child requires an explicit childrenAction, then unflag or cascade delete', async () => {
    const ax = testUser1

    // unflag branch
    let child = await sendDataset('datasets/dataset1.csv', ax)
    let virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'virtual 1', virtual: { children: [child.id] } })
    let virtualDataset = await waitForFinalize(ax, virtualRes.data.id)
    await ax.patch(`/api/v1/datasets/${child.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } })

    await assert.rejects(
      ax.delete(`/api/v1/datasets/${virtualDataset.id}`),
      (err: any) => {
        assert.equal(err.status, 409)
        return true
      }
    )

    let res = await ax.delete(`/api/v1/datasets/${virtualDataset.id}`, { params: { childrenAction: 'unflag' } })
    assert.equal(res.status, 204)
    // the child dataset survives, no longer defined as a child
    res = await ax.get(`/api/v1/datasets/${child.id}`)
    assert.equal(res.status, 200)
    assert.equal(res.data.partOf, undefined)

    // cascade-delete branch
    child = await sendDataset('datasets/dataset1.csv', ax)
    virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'virtual 2', virtual: { children: [child.id] } })
    virtualDataset = await waitForFinalize(ax, virtualRes.data.id)
    await ax.patch(`/api/v1/datasets/${child.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } })

    res = await ax.delete(`/api/v1/datasets/${virtualDataset.id}`, { params: { childrenAction: 'delete' } })
    assert.equal(res.status, 204)
    await assert.rejects(
      ax.get(`/api/v1/datasets/${child.id}`),
      (err: any) => {
        assert.equal(err.status, 404)
        return true
      }
    )
  })

  test('cannot define a reference (master-data) dataset as a child', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset', virtual: { children: [dataset.id] } })
    const virtualDataset = await waitForFinalize(ax, virtualRes.data.id)

    // turning the dataset into reference data (here just by sharing it as such) makes it ineligible
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { masterData: { shareOrgs: [{ id: 'anotherorg', name: 'Another org' }] } })

    await assert.rejects(
      ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('an empty master-data object does not prevent defining a dataset as a child', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset', virtual: { children: [dataset.id] } })
    const virtualDataset = await waitForFinalize(ax, virtualRes.data.id)

    // the UI normalizes an untouched masterData to a bag of empty structures — this must not count as reference data
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { masterData: { standardSchema: {}, virtualDatasets: {}, singleSearchs: [], bulkSearchs: [], shareOrgs: [] } })

    const res = await ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } })
    assert.equal(res.status, 200)
  })

  test('cannot turn a dataset already defined as a child into reference (master-data) data', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset', virtual: { children: [dataset.id] } })
    const virtualDataset = await waitForFinalize(ax, virtualRes.data.id)
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } })

    await assert.rejects(
      ax.patch(`/api/v1/datasets/${dataset.id}`, { masterData: { shareOrgs: [{ id: 'anotherorg', name: 'Another org' }] } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('a rejected patch does not cascade the deletion of the children it would have orphaned', async () => {
    const ax = testUser1
    const child = await sendDataset('datasets/dataset1.csv', ax)
    const conflicting = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'virtual parent', virtual: { children: [child.id] } })
    const virtualDataset = await waitForFinalize(ax, virtualRes.data.id)
    await ax.patch(`/api/v1/datasets/${child.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } })

    // the patch drops the child AND takes an already-used slug: applyPatch rejects it with a 400
    await assert.rejects(
      ax.patch(`/api/v1/datasets/${virtualDataset.id}`, { virtual: { children: [] }, slug: conflicting.slug }, { params: { childrenAction: 'delete' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )

    // the request failed, so the child must still be there, still flagged
    const res = await ax.get(`/api/v1/datasets/${child.id}`)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.partOf, { type: 'dataset', id: virtualDataset.id, title: virtualDataset.title })
  })

  test('a child dataset stays resolvable by slug, only browsing listings hide it', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual dataset', virtual: { children: [dataset.id] } })
    const virtualDataset = await waitForFinalize(ax, virtualRes.data.id)
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } })

    // a slug lookup is a targeted fetch, exactly like an id lookup: it must not be filtered
    let res = await ax.get('/api/v1/datasets', { params: { slug: dataset.slug } })
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results[0].id, dataset.id)
    res = await ax.get('/api/v1/datasets', { params: { slugs: dataset.slug } })
    assert.equal(res.data.count, 1)
  })

  test('cannot define a dataset as a child of a parent belonging to another account', async () => {
    const ax = testUser1
    const axOrg = await axiosAuth('test_user1@test.com', 'test_org1')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const datasetRef = (await ax.get('/api/v1/datasets', { params: { id: dataset.id, select: 'id' } })).data.results[0]

    // the application belongs to the org, the dataset it uses to the user's personal account
    const { data: orgApp } = await axOrg.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await axOrg.put(`/api/v1/applications/${orgApp.id}/config`, { datasets: [{ id: dataset.id, href: datasetRef.href }] })

    await assert.rejects(
      ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'application', id: orgApp.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('a dataset defined as a child cannot change account on its own', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'virtual parent', virtual: { children: [dataset.id] } })
    const virtualDataset = await waitForFinalize(ax, virtualRes.data.id)
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } })

    await assert.rejects(
      ax.put(`/api/v1/datasets/${dataset.id}/owner`, { type: 'organization', id: 'test_org1', name: 'Test Org 1' }),
      (err: any) => {
        assert.equal(err.status, 409)
        return true
      }
    )
  })

  test('changing the account of a parent migrates its children along with it', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'virtual parent', virtual: { children: [dataset.id] } })
    const virtualDataset = await waitForFinalize(ax, virtualRes.data.id)
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } })

    const newOwner = { type: 'organization', id: 'test_org1', name: 'Test Org 1' }
    const res = await ax.put(`/api/v1/datasets/${virtualDataset.id}/owner`, newOwner)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.owner, newOwner)

    // the child followed its parent, and is still flagged as its child (read from the new account)
    const axOrg = await axiosAuth('test_user1@test.com', 'test_org1')
    const child = (await axOrg.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.deepEqual(child.owner, newOwner)
    assert.deepEqual(child.partOf, { type: 'dataset', id: virtualDataset.id, title: virtualDataset.title })
  })

  test('a dataset can be created directly as a child of an eligible parent', async () => {
    const ax = testUser1
    const member = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'virtual parent', virtual: { children: [member.id] } })
    const virtualDataset = await waitForFinalize(ax, virtualRes.data.id)

    const res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'a child created from its parent',
      partOf: { type: 'dataset', id: virtualDataset.id, title: 'stale title sent by the client' }
    })
    assert.equal(res.status, 201)
    // the parent's title is denormalized server-side at creation too
    assert.deepEqual(res.data.partOf, { type: 'dataset', id: virtualDataset.id, title: virtualDataset.title })

    // and it is immediately hidden from the default listing, like any other child
    const list = await ax.get('/api/v1/datasets')
    assert.ok(!list.data.results.find((d: any) => d.id === res.data.id))
  })

  test('a dataset can be created directly as a child of an application', async () => {
    const ax = testUser1
    const { data: app } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })

    // the parent of a child dataset is a virtual dataset OR an application
    const res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'a child created from its parent application',
      partOf: { type: 'application', id: app.id }
    })
    assert.equal(res.status, 201)
    assert.deepEqual(res.data.partOf, { type: 'application', id: app.id, title: app.title })

    const list = await ax.get('/api/v1/datasets')
    assert.ok(!list.data.results.find((d: any) => d.id === res.data.id))
  })

  test('cannot create a dataset as a child of a parent belonging to another account', async () => {
    const ax = testUser1
    const axOrg = await axiosAuth('test_user1@test.com', 'test_org1')
    const member = await sendDataset('datasets/dataset1.csv', axOrg)
    const virtualRes = await axOrg.post('/api/v1/datasets', { isVirtual: true, title: 'org virtual', virtual: { children: [member.id] } })
    await waitForFinalize(axOrg, virtualRes.data.id)

    await assert.rejects(
      ax.post('/api/v1/datasets', { isRest: true, title: 'a child', partOf: { type: 'dataset', id: virtualRes.data.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('cannot create a virtual dataset as a child, nor a child of a non-virtual dataset', async () => {
    const ax = testUser1
    const member = await sendDataset('datasets/dataset1.csv', ax)
    const virtualRes = await ax.post('/api/v1/datasets', { isVirtual: true, title: 'virtual parent', virtual: { children: [member.id] } })
    await waitForFinalize(ax, virtualRes.data.id)

    await assert.rejects(
      ax.post('/api/v1/datasets', { isVirtual: true, title: 'a virtual child', virtual: { children: [member.id] }, partOf: { type: 'dataset', id: virtualRes.data.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
    // a plain file/rest dataset can never be a parent of a dataset, only a virtual one can
    await assert.rejects(
      ax.post('/api/v1/datasets', { isRest: true, title: 'a child', partOf: { type: 'dataset', id: member.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })

  test('an organization contributor cannot flag an existing dataset as a child, that stays admin-only', async () => {
    const member = await sendDataset('datasets/dataset1.csv', testOrg1Admin)
    const virtualRes = await testOrg1Admin.post('/api/v1/datasets', { isVirtual: true, title: 'virtual parent', virtual: { children: [member.id] } })
    const virtualDataset = await waitForFinalize(testOrg1Admin, virtualRes.data.id)

    // the contributor holds the write class on both resources, but writePartOf is admin-class
    await assert.rejects(
      testOrg1Contrib.patch(`/api/v1/datasets/${member.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } }),
      (err: any) => {
        assert.equal(err.status, 403)
        return true
      }
    )
  })

  test('dropping a child from a virtual dataset cascades without any permission check on the child', async () => {
    const member = await sendDataset('datasets/dataset1.csv', testOrg1Admin)
    const child = await sendDataset('datasets/dataset1.csv', testOrg1Admin)
    const virtualRes = await testOrg1Admin.post('/api/v1/datasets', { isVirtual: true, title: 'virtual parent', virtual: { children: [member.id, child.id] } })
    const virtualDataset = await waitForFinalize(testOrg1Admin, virtualRes.data.id)
    await testOrg1Admin.patch(`/api/v1/datasets/${child.id}`, { partOf: { type: 'dataset', id: virtualDataset.id } })

    // the contributor is stripped of every permission on the child, and keeps the write class on the parent
    await testOrg1Admin.put(`/api/v1/datasets/${child.id}/permissions`, [])
    await assert.rejects(
      testOrg1Contrib.get(`/api/v1/datasets/${child.id}`),
      (err: any) => {
        assert.equal(err.status, 403)
        return true
      }
    )

    const res = await testOrg1Contrib.patch(`/api/v1/datasets/${virtualDataset.id}`, { virtual: { children: [member.id] } }, { params: { childrenAction: 'delete' } })
    assert.equal(res.status, 200)
    await waitForFinalize(testOrg1Admin, virtualDataset.id)
    await assert.rejects(
      testOrg1Admin.get(`/api/v1/datasets/${child.id}`),
      (err: any) => {
        assert.equal(err.status, 404)
        return true
      }
    )
  })

  test('an organization contributor can create a dataset as a child of a virtual dataset it can edit', async () => {
    const member = await sendDataset('datasets/dataset1.csv', testOrg1Admin)
    const virtualRes = await testOrg1Admin.post('/api/v1/datasets', { isVirtual: true, title: 'virtual parent', virtual: { children: [member.id] } })
    const virtualDataset = await waitForFinalize(testOrg1Admin, virtualRes.data.id)

    const res = await testOrg1Contrib.post('/api/v1/datasets', {
      isRest: true,
      title: 'a child created by a contributor',
      partOf: { type: 'dataset', id: virtualDataset.id }
    })
    assert.equal(res.status, 201)
    assert.deepEqual(res.data.partOf, { type: 'dataset', id: virtualDataset.id, title: virtualDataset.title })
  })

  test('creating a dataset as a child requires a write operation on the parent, reading it is not enough', async () => {
    const member = await sendDataset('datasets/dataset1.csv', testOrg1Admin)
    const virtualRes = await testOrg1Admin.post('/api/v1/datasets', { isVirtual: true, title: 'virtual parent', virtual: { children: [member.id] } })
    const virtualDataset = await waitForFinalize(testOrg1Admin, virtualRes.data.id)
    await testOrg1Admin.put(`/api/v1/datasets/${virtualDataset.id}/permissions`, [
      { type: 'organization', id: 'test_org1', roles: ['contrib'], classes: ['read'] }
    ])

    await assert.rejects(
      testOrg1Contrib.post('/api/v1/datasets', { isRest: true, title: 'a child', partOf: { type: 'dataset', id: virtualDataset.id } }),
      (err: any) => {
        assert.equal(err.status, 403)
        return true
      }
    )
  })

  test('creating a dataset as a child of a virtual parent requires the breaking variant of writeDescription', async () => {
    const member = await sendDataset('datasets/dataset1.csv', testOrg1Admin)
    const virtualRes = await testOrg1Admin.post('/api/v1/datasets', { isVirtual: true, title: 'virtual parent', virtual: { children: [member.id] } })
    const virtualDataset = await waitForFinalize(testOrg1Admin, virtualRes.data.id)
    // adding a member to a virtual dataset patches `virtual`, a breaking key: plain writeDescription
    // would let the contributor create a child it could never attach to the parent
    await testOrg1Admin.put(`/api/v1/datasets/${virtualDataset.id}/permissions`, [
      { type: 'organization', id: 'test_org1', roles: ['contrib'], operations: ['readDescription', 'writeDescription'] }
    ])

    await assert.rejects(
      testOrg1Contrib.post('/api/v1/datasets', { isRest: true, title: 'a child', partOf: { type: 'dataset', id: virtualDataset.id } }),
      (err: any) => {
        assert.equal(err.status, 403)
        return true
      }
    )
  })

  test('creating a dataset as a child of an application parent accepts writeConfig alone', async () => {
    const { data: parentApp } = await testOrg1Admin.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await testOrg1Admin.put(`/api/v1/applications/${parentApp.id}/permissions`, [
      { type: 'organization', id: 'test_org1', roles: ['contrib'], operations: ['readDescription', 'writeConfig'] }
    ])

    const res = await testOrg1Contrib.post('/api/v1/datasets', {
      isRest: true,
      title: 'a child of an application',
      partOf: { type: 'application', id: parentApp.id }
    })
    assert.equal(res.status, 201)
    assert.deepEqual(res.data.partOf, { type: 'application', id: parentApp.id, title: parentApp.title })
  })
})
