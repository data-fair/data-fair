import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const u1 = await axiosAuth('test_user1@test.com')

const metaOnly = async (id: string, body: Record<string, any> = {}) => {
  await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id, ...body })
}
const search = async (params: Record<string, any>) =>
  (await u1.get('/api/v1/datasets', { params: { select: 'id', ...params } })).data

test.describe('catalog search behaviour', () => {
  test.beforeEach(async () => {
    await clean()
    await metaOnly('sb-conso-gaz', { title: 'Consommation annuelle de gaz' })
    await metaOnly('sb-conso-elec', { title: 'Consommation annuelle electrique' })
    await metaOnly('sb-courbe', { title: 'Courbe de charge des clients', description: 'Courbe de charge mesuree' })
    await metaOnly('sb-autre', { title: 'Repertoire des communes' })
  })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('a query whose every term is unknown returns NOTHING, not everything', async () => {
    // the catastrophic failure: a null plan rendered as "no text filter" would return the catalog
    assert.ok((await search({})).count >= 4, 'the fixture must have datasets')
    const res = await search({ q: 'zzqxnotacorpusterm' })
    assert.equal(res.count, 0)
    assert.equal(res.results.length, 0)
  })

  test('count agrees with the results length, including for a phrase query', async () => {
    for (const q of ['consommation', '"courbe de charge"']) {
      const res = await search({ q, size: 100 })
      assert.equal(res.count, res.results.length, `count disagrees with results for q=${q}`)
    }
  })

  test('a negated term excludes, and a query of only negations returns nothing', async () => {
    const all = await search({ q: 'consommation', size: 100 })
    assert.equal(all.count, 2)
    const negated = await search({ q: 'consommation -gaz', size: 100 })
    assert.deepEqual(negated.results.map((r: any) => r.id), ['sb-conso-elec'])
    assert.equal((await search({ q: '-consommation' })).count, 0)
  })

  test('tied scores return a stable order across identical calls', async () => {
    // sb-conso-gaz and sb-conso-elec have the same shape, so "consommation annuelle" ties them
    const once = await search({ q: 'consommation annuelle', size: 20 })
    const twice = await search({ q: 'consommation annuelle', size: 20 })
    assert.deepEqual(once.results.map((r: any) => r.id), twice.results.map((r: any) => r.id))
  })
})
