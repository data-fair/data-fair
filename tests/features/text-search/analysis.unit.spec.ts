import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { createAnalyzer, lightFrenchStem } from '../../../api/src/misc/utils/text-search/analysis.ts'

const fr = createAnalyzer('fr')
const terms = (text: string) => fr.analyze(text).map(t => t.term)

const en = createAnalyzer('en')
const enTerms = (text: string) => en.analyze(text).map(t => t.term)

test.describe('lightFrenchStem', () => {
  test('unifies singular and plural to the same stem', () => {
    // the point of stemming: both forms must collapse, or a query for one misses the other
    for (const [a, b] of [['charges', 'charge'], ['communes', 'commune'], ['donnees', 'donnee'], ['annuelles', 'annuelle']]) {
      assert.equal(lightFrenchStem(a), lightFrenchStem(b), `${a} vs ${b}`)
    }
  })

  test('irregular plurals in -aux', () => {
    assert.equal(lightFrenchStem('chevaux'), 'cheval')
    assert.equal(lightFrenchStem('bateaux'), 'bateau')
  })

  test('is LIGHT — it does not strip derivational suffixes', () => {
    assert.equal(lightFrenchStem('consommation'), 'consommation')
  })

  test('leaves short words alone', () => {
    assert.equal(lightFrenchStem('prix'), 'prix')
    assert.equal(lightFrenchStem('eau'), 'eau')
  })

  test('only ever produces [a-z0-9] — stems are used as mongo object keys', () => {
    for (const w of ['charges', 'chevaux', 'consommation', 'l', 'a1b2']) {
      assert.match(lightFrenchStem(w), /^[a-z0-9]*$/)
    }
  })
})

test.describe('analyzer', () => {
  test('deaccents, lowercases and drops stopwords', () => {
    assert.deepEqual(terms('Consommation de GAZ'), ['consommation', 'gaz'])
  })

  test('deaccents accented characters for stopword matching and stemming', () => {
    // "même" is a French stopword, but stored unaccented as "meme". Without deaccenting,
    // it would not be recognized and would remain in the output.
    // "chose" should stem to "chos" after the s/e stripping rules.
    assert.deepEqual(terms('la même chose'), ['chos'])
    // "énergie" should stem correctly after deaccenting to "energie"
    const energieTokens = fr.analyze('énergie')
    assert.equal(energieTokens.length, 1)
    assert.equal(energieTokens[0].term, 'energi')
  })

  test('positions are RAW indices, so stopword gaps survive', () => {
    // "courbe de charge" must NOT look adjacent, or it would match "courbe et charge"
    const toks = fr.analyze('courbe de charge')
    assert.deepEqual(toks.map(t => t.position), [0, 2])
  })

  test('apostrophes separate, so elided articles disappear on their own', () => {
    assert.deepEqual(terms("l'eau d'ici"), ['eau', 'ici'])
  })

  test('drops one-character tokens', () => {
    assert.deepEqual(terms('a b cd'), ['cd'])
  })

  test('empty and nullish input give no tokens', () => {
    for (const v of ['', '   ', null, undefined]) assert.deepEqual(fr.analyze(v as any), [])
  })

  test('an unknown language degrades to no stemming, not a crash', () => {
    const xx = createAnalyzer('xx')
    assert.deepEqual(xx.analyze('Charges Communes').map(t => t.term), ['charges', 'communes'])
  })

  test('a custom stemmer can be injected', () => {
    const up = createAnalyzer('fr', { fr: (w) => w.slice(0, 3) })
    assert.deepEqual(up.analyze('consommation').map(t => t.term), ['con'])
  })
})

test.describe('English analyzer', () => {
  test('unifies singular and plural to the same stem', () => {
    // English stemmer must collapse common singular/plural patterns
    for (const [a, b] of [['boxes', 'box'], ['cities', 'city'], ['datasets', 'dataset']]) {
      assert.equal(
        en.analyze(a)[0].term,
        en.analyze(b)[0].term,
        `${a} and ${b} should have the same stem`
      )
    }
  })

  test('preserves double-s words (class/classes)', () => {
    // "ss" at the end should prevent the s-stripping rule from applying
    assert.deepEqual(enTerms('class'), ['class'])
    assert.deepEqual(enTerms('classes'), ['class'])
  })
})
