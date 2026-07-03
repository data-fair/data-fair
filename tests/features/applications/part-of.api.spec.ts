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
      ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { id: parentApp.id } }),
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
      ax.patch(`/api/v1/applications/${app.id}`, { partOf: { id: app.id } }),
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
      ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { id: parent1.id } }),
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

    let res = await ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { id: parentApp.id, title: 'stale title sent by the client' } })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.partOf, { id: parentApp.id, title: parentApp.title })

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

    await ax.patch(`/api/v1/applications/${childApp.id}`, { partOf: { id: parentApp.id } })
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
})
