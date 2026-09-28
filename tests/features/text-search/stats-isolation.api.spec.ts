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
    // a corpus whose avgLen.searchTerms is as SMALL as it can get: avgLen is averaged over the
    // documents that have the field, so every dataset carries a one-term searchTerms (avgLen 1),
    // and long descriptions push avgLen.description up. Datasets without searchTerms would not
    // lower that average, so they could not poison it.
    await clean()
    for (let i = 0; i < 8; i++) {
      await metaOnly('pz-' + i, {
        title: 'Jeu de donnees numero ' + i,
        description: 'Resultats des elections et decoupage geographique des bureaux de vote pour la commune numero ' + i + ' avec beaucoup de mots supplementaires pour allonger la description moyenne du corpus'
      })
      await u1.patch('/api/v1/datasets/pz-' + i, { searchTerms: 'scrutin' })
    }
    // query it, so n / df / avgLen are all memoized against THIS corpus
    assert.equal((await u1.get('/api/v1/datasets', { params: { q: 'élections', select: 'id' } })).data.count, 8)

    // now replace the corpus wholesale, exactly as the next test case would
    await clean()
    await metaOnly('cs-bureaux', { title: 'Contours des bureaux de vote', description: 'Découpage géographique des bureaux' })
    await metaOnly('cs-legislatives', { title: 'Circonscriptions législatives', description: 'Résultats des élections législatives par circonscription' })
    // six terms: against its own corpus (avgLen 6) this field is of average length, against the
    // stale avgLen of 1 it looks six times too long. Three terms would not be enough: the stale
    // penalty would still leave it ahead of the description hit.
    await u1.patch('/api/v1/datasets/cs-bureaux', { searchTerms: 'élections scrutin électeurs vote urne bulletin' })

    // the searchTerms hit (weight 3) must outrank the description hit (weight 1): about 3.0 to 0.9
    // with this corpus's statistics. Against the stale ones (avgLen.searchTerms 1, a long
    // avgLen.description) it scores about 1.0 to 1.4 and the weight-1 description wins.
    const res = (await u1.get('/api/v1/datasets', { params: { q: 'élections', select: 'id' } })).data
    assert.equal(res.count, 2)
    assert.equal(res.results[0].id, 'cs-bureaux')
  })
})
