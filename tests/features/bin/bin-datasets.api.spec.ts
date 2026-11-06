import { test } from '../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, config, mockAppUrl, waitForWorkerIdle, anonymousAx, apiUrl } from '../../support/axios.ts'
import {
  sendDataset, patchRawDataset, patchRawApplication, clearDatasetCache, clearPublicationSitesCache,
  getRawDataset, restCollectionCount, waitForFinalize, waitForDatasetError
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
