import { test } from '../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, config, mockAppUrl, waitForWorkerIdle, anonymousAx, apiUrl } from '../../support/axios.ts'
import {
  sendDataset, patchRawDataset, patchRawApplication, clearDatasetCache, clearPublicationSitesCache,
  getRawDataset, restCollectionCount, waitForFinalize, waitForDatasetError, collectNotifications
} from '../../support/workers.ts'
import { ensureIntegrityBucket, waitForFlagCleared } from '../../support/integrity.ts'

const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1') // admin of test_org1
const testSuperadmin = await axiosAuth('test_superadmin@test.com', undefined, true)

const shelved = () => ({ at: new Date().toISOString(), by: { id: 'test_user1', name: 'x' } })

test.describe('shelved reads as missing', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('a shelved dataset answers 404 on every single-resource read', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    await testUser1Org.patch(`/api/v1/datasets/${dataset.id}`, { slug: 'binned-slug' })
    // reads work before shelving
    for (const sub of ['', '/lines', '/raw', '/schema', '/permissions']) {
      assert.equal((await testUser1Org.get(`/api/v1/datasets/${dataset.id}${sub}`)).status, 200, sub)
    }
    await patchRawDataset(dataset.id, { shelved: shelved() })
    await clearDatasetCache()
    for (const key of [dataset.id, 'binned-slug']) {
      for (const sub of ['', '/lines', '/raw', '/schema', '/permissions']) {
        await assert.rejects(testUser1Org.get(`/api/v1/datasets/${key}${sub}`), { status: 404 }, `${key}${sub}`)
      }
    }
    await assert.rejects(testUser1Org.patch(`/api/v1/datasets/${dataset.id}`, { title: 'x' }), { status: 404 })
  })

  test('a dataset shelved after being cached reads as missing', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    assert.equal((await testUser1Org.get(`/api/v1/datasets/${dataset.id}/lines`)).status, 200)
    // no cache clearing: the freshness probe alone must notice
    await patchRawDataset(dataset.id, { shelved: shelved() })
    await assert.rejects(testUser1Org.get(`/api/v1/datasets/${dataset.id}/lines`), { status: 404 })
  })

  test('an application configured with a shelved dataset cannot read it', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    const app = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    await testUser1Org.put(`/api/v1/applications/${app.id}/config`, { datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${dataset.id}`, id: dataset.id }] })
    await patchRawDataset(dataset.id, { shelved: shelved() })
    await clearDatasetCache()
    assert.equal((await testUser1Org.get(`/api/v1/applications/${app.id}`)).status, 200)
    await assert.rejects(testUser1Org.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { referer: `${config.publicUrl}/app/${app.id}/` } }), { status: 404 })
  })

  test('a shelved application cannot be the parent of a dataset', async () => {
    const dashboard = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    await patchRawApplication(dashboard.id, { shelved: shelved() })
    await assert.rejects(testUser1Org.patch(`/api/v1/datasets/${dataset.id}`, { partOf: { type: 'application', id: dashboard.id } }), { status: 404 })
  })
})

test.describe('shelved absent from listings', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  const publicUrl2 = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT2}/data-fair`

  test('a shelved dataset is absent from the listing, counts, facets, search, id pinning, catalog and activity', async () => {
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', { type: 'data-fair-portals', id: 'portal1', url: 'http://' + process.env.DEV_HOST + ':' + process.env.NGINX_PORT2 })
    await clearPublicationSitesCache()
    const live = (await testUser1Org.post('/api/v1/datasets/bin-live', { isRest: true, title: 'bin live quokkalive', schema: [], publicationSites: ['data-fair-portals:portal1'] })).data
    const gone = (await testUser1Org.post('/api/v1/datasets/bin-gone', { isRest: true, title: 'bin gone quokkashelved', schema: [], publicationSites: ['data-fair-portals:portal1'] })).data
    await patchRawDataset(gone.id, { shelved: shelved() })

    const list = (await testUser1Org.get('/api/v1/datasets?owner=organization:test_org1&facets=owner')).data
    assert.equal(list.count, 1)
    assert.deepEqual(list.results.map((r: any) => r.id), [live.id])
    const facetTotal = Object.values(list.facets.owner).reduce((a: number, f: any) => a + f.count, 0)
    assert.equal(facetTotal, 1)

    assert.equal((await testUser1Org.get('/api/v1/datasets?q=quokkashelved')).data.count, 0)
    assert.equal((await testUser1Org.get('/api/v1/datasets?q=quokkalive')).data.count, 1)
    assert.equal((await testUser1Org.get(`/api/v1/datasets?id=${gone.id}`)).data.count, 0)
    assert.equal((await testUser1Org.get(`/api/v1/datasets?id=${live.id}`)).data.count, 1)

    const catalog = (await testUser1Org.get(`${publicUrl2}/api/v1/catalog/datasets`)).data
    assert.deepEqual(catalog.results.map((r: any) => r.id), [live.id])
    assert.equal(catalog.count, 1)
    const dcat = JSON.stringify((await testUser1Org.get(`${publicUrl2}/api/v1/catalog/dcat`)).data)
    assert.ok(dcat.includes('quokkalive'))
    assert.ok(!dcat.includes('quokkashelved'))

    const activity = (await testUser1Org.get('/api/v1/activity')).data.results
    assert.ok(activity.find((r: any) => r.id === live.id))
    assert.ok(!activity.find((r: any) => r.id === gone.id))
  })

  test('syncApplications drops a shelved application from dataset.extras.applications', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    const app = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    await testUser1Org.put(`/api/v1/applications/${app.id}/config`, { datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${dataset.id}`, id: dataset.id }] })
    await patchRawApplication(app.id, { shelved: shelved() })
    // re-sync is triggered by a new configuration of another application
    const other = (await testUser1Org.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
    await testUser1Org.put(`/api/v1/applications/${other.id}/config`, { datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${dataset.id}`, id: dataset.id }] })
    await clearDatasetCache()
    const refs = (await testUser1Org.get(`/api/v1/datasets/${dataset.id}`)).data.extras?.applications ?? []
    assert.deepEqual(refs.map((a: any) => a.id), [other.id])
  })
})

test.describe('shelved is inert', () => {
  test.beforeAll(async () => { await ensureIntegrityBucket() })

  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  // a raw patch does not ping the worker: let several polling intervals (500 ms in dev) pass
  // before asserting that nothing happened
  const letWorkersPoll = async () => {
    await new Promise(resolve => setTimeout(resolve, 2000))
    assert.ok(await waitForWorkerIdle(10000))
  }

  test('REST line expiration does not run on a shelved dataset', async () => {
    const ax = testUser1Org
    await ax.post('/api/v1/datasets/bin-ttl', {
      isRest: true,
      title: 'bin ttl',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string', format: 'date-time' }]
    })
    await ax.post('/api/v1/datasets/bin-ttl/_bulk_lines', [
      { attr1: 'expired', attr2: new Date(Date.now() - 3 * 86400000).toISOString() },
      { attr1: 'fresh', attr2: new Date().toISOString() }
    ])
    await waitForFinalize(ax, 'bin-ttl')
    assert.equal(await restCollectionCount('bin-ttl'), 2)

    // activate the TTL raw, already due, on a shelved dataset
    await patchRawDataset('bin-ttl', {
      shelved: shelved(),
      'rest.ttl': { active: true, prop: 'attr2', delay: { value: 1, unit: 'days' }, checkedAt: new Date(Date.now() - 2 * 3600000).toISOString() }
    })
    await letWorkersPoll()
    assert.equal(await restCollectionCount('bin-ttl'), 2)

    // positive control: once restored, the very same state expires the line
    await patchRawDataset('bin-ttl', { $unset: { shelved: '' } })
    const start = Date.now()
    while (await restCollectionCount('bin-ttl') !== 1 && Date.now() - start < 10000) {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    assert.equal(await restCollectionCount('bin-ttl'), 1)
    await waitForWorkerIdle(10000)
  })

  test('a virtual parent silently skips a shelved child, and gets it back on restore', async () => {
    const ax = testUser1Org
    const childA = await sendDataset('datasets/dataset1.csv', ax)
    const childB = await sendDataset('datasets/dataset1.csv', ax)
    const virtual = (await ax.post('/api/v1/datasets', {
      isVirtual: true,
      virtual: { children: [childA.id, childB.id] },
      title: 'bin virtual'
    })).data
    await waitForFinalize(ax, virtual.id)
    assert.equal((await ax.get(`/api/v1/datasets/${virtual.id}/lines`)).data.total, 4)

    await patchRawDataset(childA.id, { shelved: shelved() })
    await clearDatasetCache()
    const res = await ax.get(`/api/v1/datasets/${virtual.id}/lines`)
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 2)
    assert.deepEqual((await getRawDataset(virtual.id)).virtual.children, [childA.id, childB.id])

    // a re-finalization of the parent (schema reconciliation) must not fail on the shelved child
    await ax.patch(`/api/v1/datasets/${virtual.id}`, { virtual: { children: [childB.id, childA.id] } })
    const refinalized = await waitForFinalize(ax, virtual.id)
    assert.equal(refinalized.status, 'finalized')
    assert.deepEqual((await getRawDataset(virtual.id)).virtual.children, [childB.id, childA.id])

    await patchRawDataset(childA.id, { $unset: { shelved: '' } })
    await clearDatasetCache()
    assert.equal((await ax.get(`/api/v1/datasets/${virtual.id}/lines`)).data.total, 4)
    assert.deepEqual((await getRawDataset(virtual.id)).virtual.children, [childB.id, childA.id])
  })

  test('re-extending from a shelved master-data dataset fails as with a missing master', async () => {
    const ax = testSuperadmin
    const siretProperty = { key: 'siret', title: 'Siret', type: 'string', 'x-refersTo': 'http://www.datatourisme.fr/ontology/core/1.0/#siret' }
    await ax.put('/api/v1/datasets/bin-master', {
      isRest: true,
      title: 'bin-master',
      schema: [siretProperty, { key: 'extra', type: 'string' }],
      masterData: { bulkSearchs: [{ id: 'siret', title: 'siret', description: '', input: [{ type: 'equals', property: siretProperty }] }] }
    })
    const master = (await ax.get('/api/v1/datasets/bin-master')).data
    await ax.post('/api/v1/_check-api', (await ax.get(master.href + '/api-docs.json')).data)
    const remoteService = (await ax.get('/api/v1/remote-services/dataset:bin-master', { params: { showAll: true } })).data
    await ax.post('/api/v1/datasets/bin-master/_bulk_lines', [{ _id: '82898347800011', siret: '82898347800011', extra: 'Extra information' }])
    await waitForFinalize(ax, 'bin-master')

    await ax.put('/api/v1/datasets/bin-slave', {
      isRest: true,
      title: 'bin-slave',
      schema: [siretProperty],
      extensions: [{ active: true, autoUpdate: true, type: 'remoteService', remoteService: remoteService.id, action: 'masterData_bulkSearch_siret', select: ['extra'] }]
    })
    await ax.post('/api/v1/datasets/bin-slave/_bulk_lines', [{ siret: '82898347800011' }])
    await waitForFinalize(ax, 'bin-slave')
    assert.equal((await ax.get('/api/v1/datasets/bin-slave/lines')).data.results[0]['_siret.extra'], 'Extra information')

    await patchRawDataset('bin-master', { shelved: shelved() })
    const slave = await getRawDataset('bin-slave')
    const errorPromise = waitForDatasetError(ax, 'bin-slave')
    await patchRawDataset('bin-slave', { extensions: [{ ...slave.extensions[0], nextUpdate: new Date(Date.now() - 1000).toISOString() }] })
    const errored = await errorPromise
    assert.equal(errored.status, 'error')
    const journal = (await ax.get('/api/v1/datasets/bin-slave/journal')).data
    const errorEvent = journal.find((e: any) => e.type === 'error')
    assert.ok(errorEvent?.data?.includes('jeu de données de référence inconnu bin-master'), JSON.stringify(errorEvent))
  })

  test('a shelved integrity dataset frozen mid-pipeline raises no integrity-check-stale alert', async () => {
    const ax = testSuperadmin
    const enrolledRest = async (id: string) => {
      await ax.post(`/api/v1/datasets/${id}`, { isRest: true, title: id, schema: [{ key: 'attr1', type: 'string' }] })
      await ax.post(`/api/v1/datasets/${id}/lines`, { attr1: 'a' })
      await waitForFinalize(ax, id)
      await ax.put(`/api/v1/datasets/${id}/_integrity`, { active: true })
      await waitForFlagCleared(id)
    }
    await enrolledRest('bin-integrity-shelved')
    await enrolledRest('bin-integrity-live')
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString()

    // a line write left pending (not yet indexed, line anchors not drained), then shelved: the
    // pipeline that would settle it is frozen, so the relay hint cannot drain
    await patchRawDataset('bin-integrity-shelved', {
      shelved: shelved(),
      _partialRestStatus: 'updated',
      _needsHistorizingLines: true,
      'integrity.lastDefinitiveCheck': eightDaysAgo
    })
    // control: the same silent clock on a live dataset does alert
    await patchRawDataset('bin-integrity-live', { 'integrity.lastDefinitiveCheck': eightDaysAgo })
    await letWorkersPoll()
    const frozen = await getRawDataset('bin-integrity-shelved')
    assert.equal(frozen._needsHistorizingLines, true)
    assert.equal(frozen._partialRestStatus, 'updated')

    const run = (await anonymousAx.post(`${apiUrl}/api/v1/test-env/integrity-stale/run`)).data
    assert.ok(run.alerted.includes('bin-integrity-live'))
    assert.ok(!run.alerted.includes('bin-integrity-shelved'))
    assert.equal((await getRawDataset('bin-integrity-shelved')).integrity.alerts?.['integrity-check-stale'], undefined)
  })

  test('integrity historization still drains on a shelved dataset', async () => {
    const ax = testSuperadmin
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await patchRawDataset(dataset.id, {
      shelved: shelved(),
      integrity: { active: true },
      _needsHistorizing: { context: { operation: 'enable', origin: 'superadmin' } }
    })
    const raw = await waitForFlagCleared(dataset.id)
    assert.equal(raw._needsHistorizing, undefined)
    assert.ok(raw.integrity.lastRevision)
    assert.ok(raw.shelved)
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
  const restore = async (type: 'datasets' | 'applications', id: string) => {
    await testUser1Org.post(`/api/v1/bin/${type}/${id}/_restore`)
  }
  const withoutUpdatedAt = ({ updatedAt, ...rest }: any) => rest

  test('DELETE shelves a dataset when the org bin is active, restore brings it back intact', async () => {
    await enableBin()
    await testUser1Org.post('/api/v1/datasets/bin-shelve', { isRest: true, title: 'bin shelve', schema: [{ key: 'str', type: 'string' }] })
    await testUser1Org.post('/api/v1/datasets/bin-shelve/_bulk_lines', [{ str: 'a' }, { str: 'b' }])
    await waitForFinalize(testUser1Org, 'bin-shelve')
    const before = (await testUser1Org.get('/api/v1/datasets/bin-shelve')).data
    const linesBefore = (await testUser1Org.get('/api/v1/datasets/bin-shelve/lines')).data.total
    assert.equal(linesBefore, 2)
    const limitsBefore = (await testUser1Org.get('/api/v1/limits/organization/test_org1')).data
    const notifications = await collectNotifications()

    assert.equal((await testUser1Org.delete('/api/v1/datasets/bin-shelve')).status, 204)
    const raw = await getRawDataset('bin-shelve')
    assert.equal(raw.shelved.by.id, 'test_user1')
    assert.ok(raw.shelved.at)
    assert.equal(raw.shelved.cascade, undefined)
    await assert.rejects(testUser1Org.get('/api/v1/datasets/bin-shelve'), { status: 404 })
    await assert.rejects(testUser1Org.get('/api/v1/datasets/bin-shelve/lines'), { status: 404 })
    const limitsAfter = (await testUser1Org.get('/api/v1/limits/organization/test_org1')).data
    assert.deepEqual(limitsAfter.nb_datasets, limitsBefore.nb_datasets)
    const shelveNotif = (await notifications.waitForCount(1)).find((n: any) => n.topic.key === 'data-fair:dataset-delete:bin-shelve')
    assert.equal(shelveNotif?.title, 'Jeu de données placé dans la corbeille')

    await restore('datasets', 'bin-shelve')
    assert.equal((await getRawDataset('bin-shelve')).shelved, undefined)
    const after = (await testUser1Org.get('/api/v1/datasets/bin-shelve')).data
    assert.deepEqual(withoutUpdatedAt(after), withoutUpdatedAt(before))
    assert.equal((await testUser1Org.get('/api/v1/datasets/bin-shelve/lines')).data.total, linesBefore)
    const restoreNotif = (await notifications.getAll()).find((n: any) => n.topic.key === 'data-fair:dataset-restore:bin-shelve')
    assert.equal(restoreNotif?.title, 'Jeu de données restauré depuis la corbeille')
  })

  test('DELETE removes the dataset when the bin is off', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    assert.equal((await testUser1Org.delete(`/api/v1/datasets/${dataset.id}`)).status, 204)
    await assert.rejects(getRawDataset(dataset.id), { status: 404 })
  })

  test('DELETE removes a user-owned dataset even when the org bin is active', async () => {
    await enableBin()
    const testUser1 = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1)
    assert.equal(dataset.owner.type, 'user')
    assert.equal((await testUser1.delete(`/api/v1/datasets/${dataset.id}`)).status, 204)
    await assert.rejects(getRawDataset(dataset.id), { status: 404 })
  })

  test('shelving a dataset shelves its fragments, restoring it brings them back', async () => {
    await enableBin()
    const parent = (await testUser1Org.post('/api/v1/datasets', { isMetaOnly: true, title: 'bin parent' })).data
    const fragment = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: parent.id } })
    // an independently shelved fragment keeps its own marker and is not restored with the parent
    const otherFragment = await sendDataset('datasets/dataset1.csv', testUser1Org, {}, { partOf: { type: 'dataset', id: parent.id } })
    await testUser1Org.delete(`/api/v1/datasets/${otherFragment.id}`)
    assert.equal((await getRawDataset(otherFragment.id)).shelved.cascade, undefined)

    await testUser1Org.delete(`/api/v1/datasets/${parent.id}`)
    await assert.rejects(testUser1Org.get(`/api/v1/datasets/${fragment.id}`), { status: 404 })
    assert.equal((await getRawDataset(fragment.id)).shelved.cascade, true)
    assert.equal((await getRawDataset(parent.id)).shelved.cascade, undefined)

    await restore('datasets', parent.id)
    assert.equal((await testUser1Org.get(`/api/v1/datasets/${parent.id}`)).status, 200)
    assert.equal((await testUser1Org.get(`/api/v1/datasets/${fragment.id}`)).status, 200)
    assert.equal((await getRawDataset(fragment.id)).shelved, undefined)
    assert.ok((await getRawDataset(otherFragment.id)).shelved)
  })

  test('shelve and restore re-finalize the virtual parents of the dataset', async () => {
    await enableBin()
    const childA = await sendDataset('datasets/dataset1.csv', testUser1Org)
    const childB = await sendDataset('datasets/dataset1.csv', testUser1Org)
    const virtual = (await testUser1Org.post('/api/v1/datasets', { isVirtual: true, virtual: { children: [childA.id, childB.id] }, title: 'bin virtual parent' })).data
    const finalized = await waitForFinalize(testUser1Org, virtual.id)
    assert.equal((await testUser1Org.get(`/api/v1/datasets/${virtual.id}/lines`)).data.total, 4)

    await testUser1Org.delete(`/api/v1/datasets/${childA.id}`)
    const afterShelve = await waitForFinalize(testUser1Org, virtual.id)
    assert.ok(afterShelve.finalizedAt > finalized.finalizedAt, 'the virtual parent was re-finalized at shelving')
    assert.equal((await testUser1Org.get(`/api/v1/datasets/${virtual.id}/lines`)).data.total, 2)
    assert.deepEqual((await getRawDataset(virtual.id)).virtual.children, [childA.id, childB.id])

    await restore('datasets', childA.id)
    const afterRestore = await waitForFinalize(testUser1Org, virtual.id)
    assert.ok(afterRestore.finalizedAt > afterShelve.finalizedAt, 'the virtual parent was re-finalized at restore')
    assert.equal((await testUser1Org.get(`/api/v1/datasets/${virtual.id}/lines`)).data.total, 4)
  })

  test('an explicit create on a shelved id answers 409, a derived slug gets another one', async () => {
    await enableBin()
    await testUser1Org.put('/api/v1/datasets/my-ds', { isRest: true, title: 'my ds', schema: [] })
    const original = (await testUser1Org.get('/api/v1/datasets/my-ds')).data
    await testUser1Org.delete('/api/v1/datasets/my-ds')
    await assert.rejects(testUser1Org.put('/api/v1/datasets/my-ds', { isRest: true, title: 'my ds', schema: [] }), (err: any) => {
      assert.equal(err.status, 409)
      assert.ok(err.data.includes('corbeille'), err.data)
      return true
    })
    await assert.rejects(testUser1Org.post('/api/v1/datasets/my-ds', { isRest: true, title: 'my ds', schema: [] }), { status: 409 })
    // ids are globally unique: another owner targeting the shelved id gets the same 409, not a duplicate key crash
    const testUser3 = await axiosAuth('test_user3@test.com')
    for (const method of ['put', 'post'] as const) {
      await assert.rejects(testUser3[method]('/api/v1/datasets/my-ds', { isRest: true, title: 'my ds', schema: [] }), (err: any) => {
        assert.equal(err.status, 409)
        assert.ok(err.data.includes('corbeille'), err.data)
        return true
      })
    }
    const res = await testUser1Org.post('/api/v1/datasets', { isRest: true, title: original.title, schema: [] })
    assert.equal(res.status, 201)
    assert.notEqual(res.data.slug, original.slug)
    assert.notEqual(res.data.id, 'my-ds')
  })

  test('the bin marker cannot be written through the dataset API', async () => {
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    await assert.rejects(testUser1Org.patch(`/api/v1/datasets/${dataset.id}`, { shelved: shelved() }), { status: 400 })
    await assert.rejects(testUser1Org.post('/api/v1/datasets', { isRest: true, title: 'bin marker', shelved: shelved() }), { status: 400 })
    await assert.rejects(testUser1Org.put('/api/v1/datasets/bin-marker', { isRest: true, title: 'bin marker', shelved: shelved() }), { status: 400 })
    assert.equal((await getRawDataset(dataset.id)).shelved, undefined)
    assert.equal((await testUser1Org.get(`/api/v1/datasets/${dataset.id}`)).status, 200)
  })

  test('a second DELETE of a shelved dataset answers 404 and keeps the first marker', async () => {
    await enableBin()
    const dataset = await sendDataset('datasets/dataset1.csv', testUser1Org)
    const notifications = await collectNotifications()
    assert.equal((await testUser1Org.delete(`/api/v1/datasets/${dataset.id}`)).status, 204)
    const marker = (await getRawDataset(dataset.id)).shelved
    await assert.rejects(testUser1Org.delete(`/api/v1/datasets/${dataset.id}`), { status: 404 })
    assert.deepEqual((await getRawDataset(dataset.id)).shelved, marker)
    await notifications.waitForCount(1)
    assert.equal((await notifications.getAll()).filter((n: any) => n.topic.key === `data-fair:dataset-delete:${dataset.id}`).length, 1)
  })

  test('the master-data remote service is removed while shelved, even on a partner withdrawal, and back on restore', async () => {
    await enableBin()
    const id = 'bin-master-rs'
    await testUser1Org.put('/api/v1/datasets/' + id, { isRest: true, title: id, schema: [{ key: 'code', type: 'string' }], masterData: { virtualDatasets: { active: true } } })
    await testUser1Org.patch('/api/v1/datasets/' + id, { masterData: { virtualDatasets: { active: true }, shareOrgs: [{ id: 'test_org2', name: 'Test Org 2' }, { id: 'test_org3', name: 'Test Org 3' }] } })
    const remoteService = () => testSuperadmin.get('/api/v1/remote-services/dataset:' + id, { params: { showAll: true } })
    assert.deepEqual((await remoteService()).data.privateAccess.map((p: any) => p.id), ['test_org1', 'test_org2', 'test_org3'])

    await testUser1Org.delete('/api/v1/datasets/' + id)
    await assert.rejects(remoteService(), { status: 404 })
    // test_org3 is no longer a partner: the withdrawal re-syncs the remote service of the shelved dataset
    await anonymousAx.post(`${apiUrl}/api/v1/identities/organization/test_org1`, { name: 'Test Org 1', partners: [{ id: 'test_org2', name: 'Test Org 2' }] }, { headers: { 'x-secret-key': config.secretKeys.identities } })
    assert.deepEqual((await getRawDataset(id)).masterData.shareOrgs.map((p: any) => p.id), ['test_org2'])
    await assert.rejects(remoteService(), { status: 404 })

    await restore('datasets', id)
    assert.deepEqual((await remoteService()).data.privateAccess.map((p: any) => p.id), ['test_org1', 'test_org2'])
  })
})
