import { test } from '../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import { axios, axiosAuth, clean, checkPendingTasks, config, mockAppUrl } from '../../support/axios.ts'
import { sendDataset, patchRawApplication, clearDatasetCache, getRawApplication, getRawDataset, collectNotifications } from '../../support/workers.ts'

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

test.describe('shelved absent from listings', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('a shelved application is absent from the listing, counts, facets, search, id pinning and activity', async () => {
    const live = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'bin live quokkalive' })).data
    const gone = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'bin gone quokkashelved' })).data
    await patchRawApplication(gone.id, { shelved: shelved() })

    const list = (await testUser1Org.get('/api/v1/applications?owner=organization:test_org1&facets=owner')).data
    assert.equal(list.count, 1)
    assert.deepEqual(list.results.map((r: any) => r.id), [live.id])
    const facetTotal = Object.values(list.facets.owner).reduce((a: number, f: any) => a + f.count, 0)
    assert.equal(facetTotal, 1)

    assert.equal((await testUser1Org.get('/api/v1/applications?q=quokkashelved')).data.count, 0)
    assert.equal((await testUser1Org.get('/api/v1/applications?q=quokkalive')).data.count, 1)
    assert.equal((await testUser1Org.get(`/api/v1/applications?id=${gone.id}`)).data.count, 0)
    assert.equal((await testUser1Org.get(`/api/v1/applications?id=${live.id}`)).data.count, 1)

    const activity = (await testUser1Org.get('/api/v1/activity')).data.results
    assert.ok(activity.find((r: any) => r.id === live.id))
    assert.ok(!activity.find((r: any) => r.id === gone.id))
  })
})

test.describe('shelve and restore', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  const enableBin = async () => {
    await testUser1Org.patch('/api/v1/settings/organization/test_org1', { bin: { active: true } })
  }
  // temporary trigger, replaced by the bin router in a later task
  const restore = async (type: 'datasets' | 'applications', id: string) => {
    await testUser1Org.post(`/api/v1/test-env/bin-restore/${type}/${id}`)
  }

  test('DELETE shelves an application with its fragments and key, restore brings them back', async () => {
    await enableBin()
    const used = await sendDataset('datasets/dataset1.csv', testUser1Org)
    const dashboard = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'bin dashboard' })).data
    const utility = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'application', id: dashboard.id } })
    const subApp = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1'), partOf: { type: 'application', id: dashboard.id } })).data
    await testUser1Org.put(`/api/v1/applications/${dashboard.id}/config`, {
      datasets: [
        { href: `${config.publicUrl}/api/v1/datasets/${utility.id}`, id: utility.id },
        { href: `${config.publicUrl}/api/v1/datasets/${used.id}`, id: used.id }
      ]
    })
    const key = (await testUser1Org.post(`/api/v1/applications/${dashboard.id}/keys`, [{ title: 'k' }])).data[0].id
    assert.equal((await anonymous.get(`/app/${dashboard.id}/?key=${key}`)).status, 200)
    // syncApplications writes extras raw, without bumping updatedAt: the read memo of the dataset is stale
    await clearDatasetCache()
    assert.ok((await testUser1Org.get(`/api/v1/datasets/${used.id}`)).data.extras.applications.find((a: any) => a.id === dashboard.id))
    const notifications = await collectNotifications()

    assert.equal((await testUser1Org.delete(`/api/v1/applications/${dashboard.id}`)).status, 204)
    const raw = await getRawApplication(dashboard.id)
    assert.equal(raw.shelved.by.id, 'test_user1')
    assert.equal(raw.shelved.cascade, undefined)
    assert.equal((await getRawDataset(utility.id)).shelved.cascade, true)
    assert.equal((await getRawApplication(subApp.id)).shelved.cascade, true)
    await assert.rejects(testUser1Org.get(`/api/v1/applications/${dashboard.id}`), { status: 404 })
    await assert.rejects(testUser1Org.get(`/api/v1/applications/${subApp.id}`), { status: 404 })
    await assert.rejects(testUser1Org.get(`/api/v1/datasets/${utility.id}`), { status: 404 })
    await assert.rejects(anonymous.get(`/app/${dashboard.id}/?key=${key}`, { maxRedirects: 0 }), { status: 404 })
    assert.ok(!((await testUser1Org.get(`/api/v1/datasets/${used.id}`)).data.extras?.applications ?? []).find((a: any) => a.id === dashboard.id))
    const shelveNotif = (await notifications.waitForCount(1)).find((n: any) => n.topic.key === `data-fair:application-delete:${dashboard.id}`)
    assert.equal(shelveNotif?.title, 'Application placée dans la corbeille')

    await restore('applications', dashboard.id)
    assert.equal((await testUser1Org.get(`/api/v1/applications/${dashboard.id}`)).status, 200)
    assert.equal((await testUser1Org.get(`/api/v1/applications/${subApp.id}`)).status, 200)
    assert.equal((await testUser1Org.get(`/api/v1/datasets/${utility.id}`)).status, 200)
    assert.equal((await anonymous.get(`/app/${dashboard.id}/?key=${key}`)).status, 200)
    assert.ok((await testUser1Org.get(`/api/v1/datasets/${used.id}`)).data.extras.applications.find((a: any) => a.id === dashboard.id))
    const restoreNotif = (await notifications.getAll()).find((n: any) => n.topic.key === `data-fair:application-restore:${dashboard.id}`)
    assert.equal(restoreNotif?.title, 'Application restaurée depuis la corbeille')
  })

  test('DELETE removes the application when the bin is off', async () => {
    const app = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    assert.equal((await testUser1Org.delete(`/api/v1/applications/${app.id}`)).status, 204)
    await assert.rejects(getRawApplication(app.id), { status: 404 })
  })

  test('an explicit create on a shelved application id answers 409', async () => {
    await enableBin()
    await testUser1Org.put('/api/v1/applications/my-app', { url: mockAppUrl('monapp1'), title: 'my app' })
    await testUser1Org.delete('/api/v1/applications/my-app')
    await assert.rejects(testUser1Org.put('/api/v1/applications/my-app', { url: mockAppUrl('monapp1'), title: 'my app' }), (err: any) => {
      assert.equal(err.status, 409)
      assert.ok(err.data.includes('corbeille'), err.data)
      return true
    })
    const res = await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'my app' })
    assert.notEqual(res.data.id, 'my-app')
    assert.notEqual(res.data.slug, 'my-app')
  })
})
