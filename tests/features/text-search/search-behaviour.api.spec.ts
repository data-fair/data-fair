import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axios, axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { clearPublicationSitesCache } from '../../support/workers.ts'

const u1 = await axiosAuth('test_user1@test.com')
const u1Org = await axiosAuth('test_user1@test.com', 'test_org1')
const publicUrl2 = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT2}/data-fair`

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

  // Document frequencies decide which terms are dropped as unknown and which ones gate the
  // candidates. Counted over the whole corpus they answered "does some dataset I cannot see contain
  // this word": a known public dataset came back for a phrase with the probed word iff it counted 0.
  test('a word only present in datasets the caller cannot see does not change what it finds', async () => {
    await u1.put('/api/v1/datasets/sb-conso-gaz/permissions', [{ classes: ['list', 'read'] }])
    const anonymous = axios()
    const probe = async (q: string) =>
      (await anonymous.get('/api/v1/datasets', { params: { select: 'id', q } })).data.results.map((r: any) => r.id)
    assert.deepEqual(await probe('"consommation zzqxunknown"'), ['sb-conso-gaz'])
    await metaOnly('sb-secret', { title: 'Dossier zzqxsecret' })
    assert.deepEqual(await probe('"consommation zzqxsecret"'), ['sb-conso-gaz'])
    // the owner sees their private dataset, so for them the word is live and the phrase applies
    assert.equal((await search({ q: '"consommation zzqxsecret"' })).count, 0)
    assert.deepEqual((await search({ q: 'zzqxsecret' })).results.map((r: any) => r.id), ['sb-secret'])
  })

  test('tied scores return a stable order across identical calls', async () => {
    // sb-conso-gaz and sb-conso-elec have the same shape, so "consommation annuelle" ties them
    const once = await search({ q: 'consommation annuelle', size: 20 })
    const twice = await search({ q: 'consommation annuelle', size: 20 })
    assert.deepEqual(once.results.map((r: any) => r.id), twice.results.map((r: any) => r.id))
  })

  // Regression guard for ownerScopeOf over-narrowing (misc/utils/find.ts). Outside catalog mode
  // findDatasets deliberately keeps OTHER owners' master-data datasets in a publication site's
  // list. Scoping the corpus statistics to the site owner made a term that only occurs in such a
  // dataset count df = 0, planQuery dropped it as unknown, and a single-term query fell back to
  // the "match nothing" filter — zero results for a dataset right there in the list.
  test('a foreign-owned master-data dataset stays findable from a publication site', async () => {
    const portal = { type: 'data-fair-portals', id: 'portal1', url: `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT2}` }
    await u1Org.post('/api/v1/settings/organization/test_org1/publication-sites', portal)
    await clearPublicationSitesCache()

    // owned by test_user1's personal account, NOT by test_org1 which owns the publication site
    await u1.post('/api/v1/datasets/sb-master-zz', {
      isMetaOnly: true,
      title: 'Referentiel zzcadastre',
      masterData: { virtualDatasets: { active: true } }
    })

    // the site owner has datasets of its own, so the owner-scoped corpus is not simply empty
    await u1Org.post('/api/v1/datasets/sb-site-owned', { isMetaOnly: true, title: 'Consommation du site' })

    const fromSite = (await u1.get(`${publicUrl2}/api/v1/datasets`, { params: { select: 'id', q: 'zzcadastre' } })).data
    assert.deepEqual(fromSite.results.map((r: any) => r.id), ['sb-master-zz'])
    assert.equal(fromSite.count, 1)
  })
})
