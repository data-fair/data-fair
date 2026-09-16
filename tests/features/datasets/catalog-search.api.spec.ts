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
})
