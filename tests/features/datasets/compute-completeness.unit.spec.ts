import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { computeCompleteness, COMPLETENESS_KEYS, type CompletenessConfig } from '../../../api/src/datasets/utils/compute-completeness.ts'

/** Context with every settings-gated criterion offered: the denominator is the full 21 points. */
const cfg = (config: CompletenessConfig = {}) => ({
  config,
  datasetsMetadata: {
    keywords: { active: true },
    creator: { active: true },
    frequency: { active: true },
    spatial: { active: true },
    temporal: { active: true },
    conformsTo: { active: true }
  },
  hasTopics: true
})

/** Nothing offered beyond the four unconditional criteria: denominator 11. */
const bare = (config: CompletenessConfig = {}) => ({ config, datasetsMetadata: {}, hasTopics: false })

const fullDataset = {
  description: 'd'.repeat(200),
  summary: 's'.repeat(100),
  license: { title: 'ODbL', href: 'https://example.com/odbl' },
  keywords: ['a'],
  topics: [{ id: 't1' }],
  creator: 'Koumoul',
  origin: 'https://example.com',
  frequency: 'annual',
  spatial: 'France',
  temporal: { start: '2026-01-01', end: '2026-12-31' },
  conformsTo: { title: 'Schéma des lieux de médiation numérique', url: 'https://example.com/schema.json' }
}

test.describe('computeCompleteness', () => {
  test('an empty dataset with nothing offered scores 0 and misses the four unconditional criteria', () => {
    const result = computeCompleteness({}, bare())
    assert.equal(result.score, 0)
    assert.deepEqual(result.missing, ['description', 'summary', 'license', 'origin'])
  })

  test('a fully filled dataset scores 100 whatever is offered', () => {
    assert.equal(computeCompleteness(fullDataset, cfg()).score, 100)
    assert.deepEqual(computeCompleteness(fullDataset, cfg()).missing, [])
    assert.equal(computeCompleteness(fullDataset, bare()).score, 100)
  })

  test('a criterion whose field is not offered leaves the score alone, an offered one lowers it', () => {
    const noSpatial = { ...fullDataset, spatial: '' }
    assert.equal(computeCompleteness(noSpatial, bare()).score, 100)
    const offered = computeCompleteness(noSpatial, cfg())
    assert.equal(offered.score, 95) // 20 of 21
    assert.deepEqual(offered.missing, ['spatial'])
  })

  test('topics count only when the owner defined some', () => {
    const noTopics = { ...fullDataset, topics: [] }
    assert.equal(computeCompleteness(noTopics, { config: {}, datasetsMetadata: {}, hasTopics: false }).score, 100)
    // 11 obtained of 13 applicable
    assert.equal(computeCompleteness(noTopics, { config: {}, datasetsMetadata: {}, hasTopics: true }).score, 85)
  })

  test('a weight of 0 removes its criterion from both sides of the fraction', () => {
    const noLicense = { ...fullDataset, license: null }
    assert.equal(computeCompleteness(noLicense, cfg()).score, 86) // 18 of 21
    const zeroed = computeCompleteness(noLicense, cfg({ weights: { license: 0 } }))
    assert.equal(zeroed.score, 100) // 18 of 18
    assert.deepEqual(zeroed.missing, [])
  })

  test('configured length bounds replace the defaults', () => {
    const short = { ...fullDataset, description: 'd'.repeat(120) }
    assert.deepEqual(computeCompleteness(short, bare()).missing, ['description'])
    assert.deepEqual(computeCompleteness(short, bare({ description: { min: 100 } })).missing, [])
  })

  test('the description gains an upper bound only when one is configured', () => {
    const long = { ...fullDataset, description: 'd'.repeat(6000) }
    assert.deepEqual(computeCompleteness(long, bare()).missing, [])
    assert.deepEqual(computeCompleteness(long, bare({ description: { min: 200, max: 5000 } })).missing, ['description'])
  })

  test('the summary keeps its default 50-250 window', () => {
    assert.deepEqual(computeCompleteness({ ...fullDataset, summary: 's'.repeat(49) }, bare()).missing, ['summary'])
    assert.deepEqual(computeCompleteness({ ...fullDataset, summary: 's'.repeat(50) }, bare()).missing, [])
    assert.deepEqual(computeCompleteness({ ...fullDataset, summary: 's'.repeat(250) }, bare()).missing, [])
    assert.deepEqual(computeCompleteness({ ...fullDataset, summary: 's'.repeat(251) }, bare()).missing, ['summary'])
  })

  test('lengths are measured after trim, so whitespace does not fill a criterion', () => {
    assert.deepEqual(computeCompleteness({ ...fullDataset, description: ' '.repeat(500) }, bare()).missing, ['description'])
    assert.deepEqual(computeCompleteness({ ...fullDataset, origin: '   ' }, bare()).missing, ['origin'])
  })

  test('a license needs an href, a title alone is not enough', () => {
    assert.deepEqual(computeCompleteness({ ...fullDataset, license: { title: 'ODbL' } }, bare()).missing, ['license'])
    assert.deepEqual(computeCompleteness({ ...fullDataset, license: { href: '' } }, bare()).missing, ['license'])
  })

  test('a bound of 0 does not constrain its side, which is how an upper bound is dropped', () => {
    const long = { ...fullDataset, summary: 's'.repeat(400) }
    assert.deepEqual(computeCompleteness(long, bare()).missing, ['summary'])
    assert.deepEqual(computeCompleteness(long, bare({ summary: { max: 0 } })).missing, [])
  })

  test('the applied length windows travel with the score, and only for criteria that count', () => {
    assert.deepEqual(computeCompleteness(fullDataset, bare()).lengths, {
      description: { min: 200 },
      summary: { min: 50, max: 250 }
    })
    assert.deepEqual(computeCompleteness(fullDataset, bare({ summary: { min: 10, max: 0 } })).lengths, {
      description: { min: 200 },
      summary: { min: 10 }
    })
    // a criterion removed from the calculation has no window to warn about either
    assert.deepEqual(computeCompleteness(fullDataset, bare({ weights: { description: 0 } })).lengths, {
      summary: { min: 50, max: 250 }
    })
  })

  test('the schema reference needs a title or a URL, a version alone identifies nothing', () => {
    const versionOnly = { ...fullDataset, conformsTo: { version: '1.2.0' } }
    // not offered in the owner settings: it cannot lower anything
    assert.equal(computeCompleteness(versionOnly, bare()).score, 100)
    assert.deepEqual(computeCompleteness(versionOnly, cfg()).missing, ['conformsTo'])
    assert.deepEqual(computeCompleteness({ ...fullDataset, conformsTo: { url: 'https://example.com/s.json' } }, cfg()).missing, [])
  })

  test('temporal coverage is satisfied by start alone as well as by end alone', () => {
    assert.deepEqual(computeCompleteness({ ...fullDataset, temporal: { start: '2026-01-01' } }, cfg()).missing, [])
    assert.deepEqual(computeCompleteness({ ...fullDataset, temporal: { end: '2026-12-31' } }, cfg()).missing, [])
    assert.deepEqual(computeCompleteness({ ...fullDataset, temporal: {} }, cfg()).missing, ['temporal'])
  })

  test('null values are treated as unset, not as errors', () => {
    const cleared = {
      description: null,
      summary: null,
      license: null,
      keywords: null,
      topics: null,
      creator: null,
      origin: null,
      frequency: null,
      spatial: null,
      temporal: null,
      conformsTo: null
    }
    assert.equal(computeCompleteness(cleared, cfg()).score, 0)
    assert.equal(computeCompleteness(cleared, cfg()).missing.length, 11)
  })

  test('missing follows the configured weights, not the declaration order', () => {
    const result = computeCompleteness({}, cfg({ weights: { description: 1, origin: 9 } }))
    assert.equal(result.missing[0], 'origin')
    assert.equal(result.missing.at(-1), 'conformsTo')
    assert.equal(result.score, 0)
  })

  test('equal weights fall back to the canonical key order, so missing is deterministic', () => {
    const weights = Object.fromEntries(COMPLETENESS_KEYS.map(k => [k, 1]))
    assert.deepEqual(computeCompleteness({}, cfg({ weights })).missing, COMPLETENESS_KEYS)
  })

  test('an all-zero configuration scores 0 instead of dividing by zero', () => {
    const weights = Object.fromEntries(COMPLETENESS_KEYS.map(k => [k, 0]))
    const result = computeCompleteness(fullDataset, cfg({ weights }))
    assert.equal(result.score, 0)
    assert.deepEqual(result.missing, [])
  })

  test('the score is rounded to the nearest integer', () => {
    // description (4) + summary (3) filled of 11 applicable => 63.63... => 64
    assert.equal(computeCompleteness({ description: 'd'.repeat(200), summary: 's'.repeat(100) }, bare()).score, 64)
  })
})
