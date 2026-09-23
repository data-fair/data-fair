import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { sendDataset, waitForFinalize } from '../../support/workers.ts'

const u1 = await axiosAuth('test_user1@test.com')

const metaOnly = async (id: string, body: Record<string, any>) => {
  await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id, ...body })
}

// uploads a new file version in draft mode (file-updated draft) and waits for the sample to be
// indexed. Must differ from the dataset's current file: an update whose md5 matches the current
// file is treated by preparePatch as a no-op patch and never opens a draft at all.
const openDraft = async (id: string, fileName: string) => {
  const datasetFd = fs.readFileSync('./tests/resources/datasets/' + fileName)
  const form = new FormData()
  form.append('file', datasetFd, fileName)
  await u1.post('/api/v1/datasets/' + id, form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
  return waitForFinalize(u1, id)
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

  test('a searchTerms hit still outranks a description hit when few datasets have searchTerms', async () => {
    // Every indexed dataset stores a length of 0 for the fields it lacks. If those zeros counted
    // in avgLen, a field most datasets leave empty - searchTerms, in production - would average a
    // fraction of a term, and BM25's length normalisation would crush every hit in it: with eight
    // datasets without searchTerms here, the searchTerms hit scored about 0.6 to the description
    // hit's 1.35. The fillers' long descriptions make the short description hit as strong as it
    // can be, so this also catches a partial fix. One term, so idf is a common factor.
    for (let i = 0; i < 8; i++) {
      await metaOnly('cs-filler-' + i, {
        title: 'Jeu de donnees numero ' + i,
        description: 'Inventaire des equipements sportifs et culturels de la commune numero ' + i + ' avec beaucoup de mots supplementaires pour allonger la description moyenne du corpus'
      })
    }
    await metaOnly('cs-bureaux', { title: 'Contours des bureaux de vote', description: 'Découpage géographique des bureaux' })
    await metaOnly('cs-legislatives', { title: 'Circonscriptions législatives', description: 'Résultats des élections législatives par circonscription' })
    await u1.patch('/api/v1/datasets/cs-bureaux', { searchTerms: 'élections scrutin électeurs' })

    const res = (await u1.get('/api/v1/datasets', { params: { q: 'élections', select: 'id' } })).data
    assert.deepEqual(res.results.map((r: any) => r.id), ['cs-bureaux', 'cs-legislatives'])
  })

  test('column labels feed the search, keys do not, and _searchText never leaves the API', async () => {
    await u1.post('/api/v1/datasets/cs-erp', {
      isRest: true,
      title: 'Accessibilité des ERP',
      schema: [
        // the key's own words (accueil, capacite, batiment, identifiant) must not otherwise occur
        // in the fixture, or a coincidental term overlap would confound the "keys do not feed the
        // search" assertion below with a real match on the label
        { key: 'accueil_capacite_batiment_identifiant', type: 'integer', title: 'Nombre de chambres accessibles à une personne en fauteuil roulant' },
        { key: 'nom', type: 'string' }
      ]
    })
    const byLabel = (await u1.get('/api/v1/datasets', { params: { q: 'fauteuil', select: 'id' } })).data
    assert.equal(byLabel.count, 1)
    assert.equal(byLabel.results[0].id, 'cs-erp')
    const byKey = (await u1.get('/api/v1/datasets', { params: { q: 'accueil_capacite_batiment_identifiant', size: 0 } })).data
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
        { key: 'accueil_capacite_batiment_identifiant', type: 'integer', title: 'Chambres PMR' },
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

  test('column labels are indexed, column values are not', async () => {
    const u1Org = await axiosAuth('test_user1@test.com', 'test_org1')
    // collapsable.csv's `roles` column has exactly 2 distinct values ("admin;contrib" and "admin")
    // across its 10 rows, low enough cardinality for finalize to stamp an enum on it. "contrib"
    // appears only inside that enum value: no column title/description/dataset title contains it.
    const dataset = await sendDataset('datasets/collapsable.csv', u1Org)
    const enumCol = dataset.schema.find((p: any) => p.key === 'roles')
    assert.ok(enumCol?.enum?.length, 'the roles column must carry a non-empty enum')
    const count = async (q: string) => (await u1Org.get('/api/v1/datasets', { params: { q, size: 0 } })).data.count

    // a REST dataset with an explicit column title: collapsable.csv's own columns get no title at
    // all when uploaded without one, so no label ever reaches _searchText for that fixture
    await u1Org.post('/api/v1/datasets/cs-org-labels', {
      isRest: true,
      title: 'cs-org-labels',
      schema: [{ key: 'x', type: 'string', title: 'Colonne griffonmarker' }]
    })

    assert.equal(await count('griffonmarker'), 1, 'column titles reach the search index')
    assert.equal(await count('contrib'), 0, 'column values never do')
  })

  test('the draft validate and cancel responses carry no internal or privileged field', async () => {
    // a FILE dataset (not isRest — REST datasets never enter draft mode)
    const dataset = await sendDataset('datasets/dataset1.csv', u1)
    const schema = dataset.schema.map((p: any) => p.key === 'nb' ? { ...p, title: 'Nombre fromageries' } : p)
    await u1.patch('/api/v1/datasets/' + dataset.id, { schema })
    // prove _searchText is genuinely non-empty before checking it never leaves the two routes below:
    // the column title is only findable through the search index, not through the column key or data
    assert.equal((await u1.get('/api/v1/datasets', { params: { q: 'fromageries', size: 0 } })).data.count, 1)

    // and prove _readApiKey is genuinely populated too — asserting a field is absent from a
    // response proves nothing if the document never carried it. This is the field that made these
    // two routes a privilege-escalation surface: a bearer credential otherwise gated behind the
    // `getReadApiKey` READ operation, while validateDraft/cancelDraft are WRITE-class, so a
    // write-only grantee could collect it here.
    await u1.patch('/api/v1/datasets/' + dataset.id, { readApiKey: { active: true, interval: 'P1W' } })
    assert.ok((await u1.get(`/api/v1/datasets/${dataset.id}/read-api-key`)).data.current)

    // everything clean() removes, and which must therefore not appear on either response
    const forbidden = ['_searchText', '_readApiKey', 'permissions', '_id', 'initFrom', '_uniqueRefs',
      '_partialRestStatus', '_indexShape', '_esLineBytes', '_needsHistorizing', 'loaded']
    const assertClean = (body: any, route: string) => {
      for (const key of forbidden) assert.equal(body[key], undefined, `${route} must not return ${key}`)
    }

    await openDraft(dataset.id, 'dataset2.csv')
    assertClean((await u1.post(`/api/v1/datasets/${dataset.id}/draft`)).data, 'POST /draft')
    await waitForFinalize(u1, dataset.id)

    // cancel a second draft (a different file than the current one — dataset1.csv, since the
    // validation above moved the dataset's current file to dataset2.csv — so this upload is a
    // genuine change, not a no-op that would never open a draft)
    await openDraft(dataset.id, 'dataset1.csv')
    assertClean((await u1.delete(`/api/v1/datasets/${dataset.id}/draft`)).data, 'DELETE /draft')
  })
})
