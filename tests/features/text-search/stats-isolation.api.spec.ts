import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean } from '../../support/axios.ts'

const u1 = await axiosAuth('test_user1@test.com')

const metaOnly = async (id: string, body: Record<string, any>) => {
  await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id, ...body })
}

test.describe('text search corpus statistics', () => {
  // Ranking depends on corpus-wide values - n, df and per-field avgLen - that no document
  // carries, so they are memoized (avgLen for an hour). A test environment replaces the whole
  // corpus between cases, so unless clean() drops those statistics every ranking assertion is
  // scored against whatever corpus the previous suite left behind. That makes scoring tests
  // pass or fail on what ran before them, which reads as flakiness and is not.
  test('a replaced corpus is not scored against the previous one', async () => {
    // a corpus whose avgLen.searchTerms is a small POSITIVE number: one short searchTerms among
    // eight datasets, with long descriptions. A corpus where NO document has searchTerms would
    // average 0, which stats.ts floors to 1 - not far enough from the real value to flip anything.
    await clean()
    for (let i = 0; i < 8; i++) {
      await metaOnly('pz-' + i, {
        title: 'Jeu de donnees numero ' + i,
        description: 'Resultats des elections et decoupage geographique des bureaux de vote pour la commune numero ' + i + ' avec beaucoup de mots supplementaires pour allonger la description moyenne du corpus'
      })
    }
    await u1.patch('/api/v1/datasets/pz-0', { searchTerms: 'scrutin' })
    // query it, so n / df / avgLen are all memoized against THIS corpus
    assert.equal((await u1.get('/api/v1/datasets', { params: { q: 'élections', select: 'id' } })).data.count, 8)

    // now replace the corpus wholesale, exactly as the next test case would
    await clean()
    await metaOnly('cs-bureaux', { title: 'Contours des bureaux de vote', description: 'Découpage géographique des bureaux' })
    await metaOnly('cs-legislatives', { title: 'Circonscriptions législatives', description: 'Résultats des élections législatives par circonscription' })
    await u1.patch('/api/v1/datasets/cs-bureaux', { searchTerms: 'élections scrutin électeurs' })

    // the searchTerms hit (weight 3, field length 3) must outrank the description hit (weight 1).
    // Against the stale avgLen.searchTerms of ~1/8 it does not: the length penalty collapses the
    // weight-3 field and the weight-1 description wins.
    const res = (await u1.get('/api/v1/datasets', { params: { q: 'élections', select: 'id' } })).data
    assert.equal(res.count, 2)
    assert.equal(res.results[0].id, 'cs-bureaux')
  })
})
