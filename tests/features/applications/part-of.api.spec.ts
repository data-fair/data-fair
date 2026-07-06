import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser3 = await axiosAuth('test_user3@test.com')

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

  test('partOf must carry the constant application type', async () => {
    const ax = testUser1
    const { data: childApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const childRef = (await ax.get('/api/v1/applications', { params: { id: childApp.id, select: 'id' } })).data.results[0]
    const { data: parentApp } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    await ax.put(`/api/v1/applications/${parentApp.id}/config`, { applications: [{ id: childApp.id, href: childRef.href }] })

    // missing type: rejected by schema validation
    await assert.rejects(
      ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { id: parentApp.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
    // wrong type value: rejected by schema validation
    await assert.rejects(
      ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { type: 'dataset', id: parentApp.id } }),
      (err: any) => {
        assert.equal(err.status, 400)
        return true
      }
    )
  })
})
