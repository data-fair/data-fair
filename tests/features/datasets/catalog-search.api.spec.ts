import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const u1 = await axiosAuth('test_user1@test.com')

const metaOnly = async (id: string, body: Record<string, any>) => {
  await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id, ...body })
}

test.describe('catalog search', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('french stopwords and stemming in the catalog index', async () => {
    await metaOnly('cs-logements', { title: 'Les logements sociaux', description: 'Répertoire des logements conventionnés de la métropole' })
    await metaOnly('cs-carburants', { title: 'Prix des carburants', description: 'Prix relevés dans les stations-service' })
    await metaOnly('cs-radars', { title: 'Radars fixes', description: 'Liste des radars automatiques' })

    // bare French stopwords are not terms any more (english index: they matched every dataset)
    for (const q of ['des', 'les', 'à']) {
      const res = (await u1.get('/api/v1/datasets', { params: { q, size: 0 } })).data
      assert.equal(res.count, 0, `q=${q} should match nothing`)
    }
    // a phrased query no longer drags the whole catalog in
    const phrased = (await u1.get('/api/v1/datasets', { params: { q: 'le prix des carburants dans les stations', select: 'id' } })).data
    assert.equal(phrased.count, 1)
    assert.equal(phrased.results[0].id, 'cs-carburants')
    // singular query, plural in the title: the french stemmer joins them
    const stem = (await u1.get('/api/v1/datasets', { params: { q: 'logement', select: 'id' } })).data
    assert.equal(stem.count, 1)
    assert.equal(stem.results[0].id, 'cs-logements')
  })

  test('searchTerms is patchable, searchable at title weight, and readable', async () => {
    await metaOnly('cs-bureaux', { title: 'Contours des bureaux de vote', description: 'Découpage géographique des bureaux' })
    await metaOnly('cs-legislatives', { title: 'Circonscriptions législatives', description: 'Résultats des élections législatives par circonscription' })

    const patched = await u1.patch('/api/v1/datasets/cs-bureaux', { searchTerms: 'élections scrutin électeurs' })
    assert.equal(patched.data.searchTerms, 'élections scrutin électeurs')
    const fetched = (await u1.get('/api/v1/datasets/cs-bureaux')).data
    assert.equal(fetched.searchTerms, 'élections scrutin électeurs')

    // both match "élections"; the searchTerms hit (weight 3) outranks the description hit (weight 1)
    const res = (await u1.get('/api/v1/datasets', { params: { q: 'élections', select: 'id,searchTerms' } })).data
    assert.equal(res.count, 2)
    assert.equal(res.results[0].id, 'cs-bureaux')
    assert.equal(res.results[0].searchTerms, 'élections scrutin électeurs')

    await assert.rejects(u1.patch('/api/v1/datasets/cs-bureaux', { searchTerms: 'x'.repeat(1001) }), { status: 400 })
  })

  test('column labels feed the search, keys do not, and _searchText never leaves the API', async () => {
    await u1.post('/api/v1/datasets/cs-erp', {
      isRest: true,
      title: 'Accessibilité des ERP',
      schema: [
        { key: 'accueil_chambre_nombre_accessibles', type: 'integer', title: 'Nombre de chambres accessibles à une personne en fauteuil roulant' },
        { key: 'nom', type: 'string' }
      ]
    })
    const byLabel = (await u1.get('/api/v1/datasets', { params: { q: 'fauteuil', select: 'id' } })).data
    assert.equal(byLabel.count, 1)
    assert.equal(byLabel.results[0].id, 'cs-erp')
    const byKey = (await u1.get('/api/v1/datasets', { params: { q: 'accueil_chambre_nombre_accessibles', size: 0 } })).data
    assert.equal(byKey.count, 0)

    for (const res of [
      (await u1.get('/api/v1/datasets/cs-erp')).data,
      (await u1.get('/api/v1/datasets', { params: { q: 'fauteuil' } })).data.results[0],
      (await u1.get('/api/v1/datasets', { params: { q: 'fauteuil', select: 'id,_searchText' } })).data.results[0],
      (await u1.get('/api/v1/datasets', { params: { q: 'fauteuil', select: 'id,_searchText', raw: 'true' } })).data.results[0]
    ]) assert.equal(res._searchText, undefined)

    // a title edit is an innocuous schema patch (no reprocessing): still recomputed
    await u1.patch('/api/v1/datasets/cs-erp', {
      schema: [
        { key: 'accueil_chambre_nombre_accessibles', type: 'integer', title: 'Chambres PMR' },
        { key: 'nom', type: 'string' }
      ]
    })
    assert.equal((await u1.get('/api/v1/datasets', { params: { q: 'fauteuil', size: 0 } })).data.count, 0)
    assert.equal((await u1.get('/api/v1/datasets', { params: { q: 'PMR', size: 0 } })).data.count, 1)
  })

  test('a list-only grantee removes the schema vocabulary from the search', async () => {
    await u1.post('/api/v1/datasets/cs-guard', {
      isRest: true,
      title: 'Annuaire santé',
      schema: [{ key: 'spec', type: 'string', title: 'Spécialité du médecin' }]
    })
    const count = async () => (await u1.get('/api/v1/datasets', { params: { q: 'médecin', size: 0 } })).data.count
    assert.equal(await count(), 1)
    // public may list but not read the schema: the labels must not leak through search matches
    await u1.put('/api/v1/datasets/cs-guard/permissions', [{ classes: ['list'] }])
    assert.equal(await count(), 0)
    await u1.put('/api/v1/datasets/cs-guard/permissions', [{ classes: ['list', 'read'] }])
    assert.equal(await count(), 1)
  })
})
