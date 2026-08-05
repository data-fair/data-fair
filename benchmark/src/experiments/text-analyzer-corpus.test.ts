import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SENTENCES, generateDocs, corpusStats, fillSlots } from './text-analyzer-corpus.ts'
import { mulberry32 } from '../generator.ts'

test('the corpus is a large set of distinct sentences', () => {
  assert.ok(SENTENCES.length >= 150, `only ${SENTENCES.length} sentences`)
  assert.equal(new Set(SENTENCES).size, SENTENCES.length, 'duplicate sentences in the corpus')
})

test('every sentence is a real French sentence, not a word bag', () => {
  for (const s of SENTENCES) {
    const words = s.split(/\s+/)
    assert.ok(words.length >= 6, `too short to be a sentence: "${s}"`)
    assert.match(s, /^[A-ZÀ-ÿ]/, `sentence does not start with a capital: "${s}"`)
    assert.match(s, /[.!?]$/, `sentence has no final punctuation: "${s}"`)
  }
})

test('slots are filled from the vocabularies and none leak through', () => {
  const rand = mulberry32(7)
  for (const s of SENTENCES) {
    const filled = fillSlots(s, rand)
    assert.doesNotMatch(filled, /[{}]/, `unfilled slot in "${filled}"`)
  }
})

test('generation is deterministic for a given seed', () => {
  assert.deepEqual(generateDocs(50), generateDocs(50))
  assert.notDeepEqual(generateDocs(50), generateDocs(50, 43))
})

test('docs have the intended shape: 1-sentence title, ~4-sentence description', () => {
  const docs = generateDocs(500)
  assert.equal(docs.length, 500)
  assert.equal(new Set(docs.map(d => d.id)).size, 500, 'ids must be unique')
  for (const doc of docs) {
    assert.ok(!doc.title.includes('. '), `title holds more than one sentence: "${doc.title}"`)
    assert.equal(doc.description.split(/(?<=[.!?])\s+/).length, 4)
  }
})

test('the corpus is realistic French: stopword density and inflection are in natural ranges', () => {
  const stats = corpusStats(generateDocs(2000))
  // French running text sits around 30-45% stopwords; a word-bag generator sits at 0%.
  assert.ok(stats.stopwordDensity > 0.25 && stats.stopwordDensity < 0.5,
    `stopword density out of range: ${stats.stopwordDensity}`)
  // enough inflected forms that the stemmer (and therefore keyword_repeat) actually fires
  assert.ok(stats.inflectedSuffixShare > 0.3, `too few inflected forms: ${stats.inflectedSuffixShare}`)
  assert.ok(stats.avgTitleWords > 6 && stats.avgTitleWords < 20, `title length: ${stats.avgTitleWords}`)
  assert.ok(stats.avgDescriptionWords > 30, `description length: ${stats.avgDescriptionWords}`)
  assert.ok(stats.distinctWords > 500, `vocabulary too small: ${stats.distinctWords}`)
})
