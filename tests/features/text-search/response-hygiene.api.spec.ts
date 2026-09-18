import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'

const u1 = await axiosAuth('test_user1@test.com')
const INDEX_FIELDS = ['_terms', '_pos', '_len', '_searchIndex', '_needsSearchIndex']

const metaOnly = async (id: string, body: Record<string, any> = {}) => {
  await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id, ...body })
}

test.describe('search index fields stay server-side', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('never reach a datasets list response, whatever the projection', async () => {
    await metaOnly('rh-conso', { title: 'Consommation annuelle', description: 'Par commune' })
    // findUtils.project builds an EXCLUSION projection when `select` is absent, so any field it
    // does not name is returned — that is how these leak.
    for (const params of [{}, { select: 'title,description' }, { raw: 'true' }]) {
      const res = (await u1.get('/api/v1/datasets', { params })).data
      assert.ok(res.results.length > 0, 'the fixture must return rows or this proves nothing')
      for (const dataset of res.results) {
        for (const field of INDEX_FIELDS) {
          assert.equal(dataset[field], undefined, `${field} leaked with params ${JSON.stringify(params)}`)
        }
      }
    }
  })

  test('never reach a single dataset GET', async () => {
    await metaOnly('rh-single', { title: 'Courbe de charge' })
    const dataset = (await u1.get('/api/v1/datasets/rh-single')).data
    for (const field of INDEX_FIELDS) assert.equal(dataset[field], undefined)
  })

  test('never reach an applications list response', async () => {
    await u1.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'Application de consommation' })
    for (const params of [{}, { select: 'title' }]) {
      const res = (await u1.get('/api/v1/applications', { params })).data
      assert.ok(res.results.length > 0)
      for (const application of res.results) {
        for (const field of INDEX_FIELDS) assert.equal(application[field], undefined)
      }
    }
  })

  test('never reach a single application GET, PUT or PATCH response', async () => {
    const { data: created } = await u1.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'Application de consommation' })
    const { id, slug } = created
    for (const field of INDEX_FIELDS) assert.equal(created[field], undefined, `${field} leaked from the POST response`)

    const get = (await u1.get('/api/v1/applications/' + id)).data
    for (const field of INDEX_FIELDS) assert.equal(get[field], undefined, `${field} leaked from the GET response`)

    const put = (await u1.put('/api/v1/applications/' + id, { url: mockAppUrl('monapp1'), slug, title: 'updated title' })).data
    for (const field of INDEX_FIELDS) assert.equal(put[field], undefined, `${field} leaked from the PUT response`)

    const patch = (await u1.patch('/api/v1/applications/' + id, { title: 'patched title' })).data
    for (const field of INDEX_FIELDS) assert.equal(patch[field], undefined, `${field} leaked from the PATCH response`)
  })
})
