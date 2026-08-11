import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  computeCompleteness,
  validateMetadataCompleteness,
  COMPLETENESS_KEYS,
  type CompletenessConfig,
  type CompletenessContext,
  type CompletenessInput
} from '../../../api/src/datasets/utils/compute-completeness.ts'

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

/**
 * Every case but the all-zero one below configures a non-empty denominator, so a result is always
 * returned; asserting it here keeps the assertions themselves about the score.
 */
const completenessOf = (dataset: CompletenessInput, context: CompletenessContext) => {
  const result = computeCompleteness(dataset, context)
  assert.ok(result, 'expected a completeness result')
  return result
}

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
    const result = completenessOf({}, bare())
    assert.equal(result.score, 0)
    assert.deepEqual(result.missing, ['description', 'summary', 'license', 'origin'])
  })

  test('a fully filled dataset scores 100 whatever is offered', () => {
    assert.equal(completenessOf(fullDataset, cfg()).score, 100)
    assert.deepEqual(completenessOf(fullDataset, cfg()).missing, [])
    assert.equal(completenessOf(fullDataset, bare()).score, 100)
  })

  test('a criterion whose field is not offered leaves the score alone, an offered one lowers it', () => {
    const noSpatial = { ...fullDataset, spatial: '' }
    assert.equal(completenessOf(noSpatial, bare()).score, 100)
    const offered = completenessOf(noSpatial, cfg())
    assert.equal(offered.score, 95) // 20 of 21
    assert.deepEqual(offered.missing, ['spatial'])
  })

  test('topics count only when the owner defined some', () => {
    const noTopics = { ...fullDataset, topics: [] }
    assert.equal(completenessOf(noTopics, { config: {}, datasetsMetadata: {}, hasTopics: false }).score, 100)
    // 11 obtained of 13 applicable
    assert.equal(completenessOf(noTopics, { config: {}, datasetsMetadata: {}, hasTopics: true }).score, 85)
  })

  test('a weight of 0 removes its criterion from both sides of the fraction', () => {
    const noLicense = { ...fullDataset, license: null }
    assert.equal(completenessOf(noLicense, cfg()).score, 86) // 18 of 21
    const zeroed = completenessOf(noLicense, cfg({ weights: { license: 0 } }))
    assert.equal(zeroed.score, 100) // 18 of 18
    assert.deepEqual(zeroed.missing, [])
  })

  test('configured length bounds replace the defaults', () => {
    const short = { ...fullDataset, description: 'd'.repeat(120) }
    assert.deepEqual(completenessOf(short, bare()).missing, ['description'])
    assert.deepEqual(completenessOf(short, bare({ description: { min: 100 } })).missing, [])
  })

  test('the description gains an upper bound only when one is configured', () => {
    const long = { ...fullDataset, description: 'd'.repeat(6000) }
    assert.deepEqual(completenessOf(long, bare()).missing, [])
    assert.deepEqual(completenessOf(long, bare({ description: { min: 200, max: 5000 } })).missing, ['description'])
  })

  test('the summary keeps its default 50-250 window', () => {
    assert.deepEqual(completenessOf({ ...fullDataset, summary: 's'.repeat(49) }, bare()).missing, ['summary'])
    assert.deepEqual(completenessOf({ ...fullDataset, summary: 's'.repeat(50) }, bare()).missing, [])
    assert.deepEqual(completenessOf({ ...fullDataset, summary: 's'.repeat(250) }, bare()).missing, [])
    assert.deepEqual(completenessOf({ ...fullDataset, summary: 's'.repeat(251) }, bare()).missing, ['summary'])
  })

  test('lengths are measured after trim, so whitespace does not fill a criterion', () => {
    assert.deepEqual(completenessOf({ ...fullDataset, description: ' '.repeat(500) }, bare()).missing, ['description'])
    assert.deepEqual(completenessOf({ ...fullDataset, origin: '   ' }, bare()).missing, ['origin'])
  })

  test('a license needs an href, a title alone is not enough', () => {
    assert.deepEqual(completenessOf({ ...fullDataset, license: { title: 'ODbL' } }, bare()).missing, ['license'])
    assert.deepEqual(completenessOf({ ...fullDataset, license: { href: '' } }, bare()).missing, ['license'])
  })

  test('a bound of 0 does not constrain its side, which is how an upper bound is dropped', () => {
    const long = { ...fullDataset, summary: 's'.repeat(400) }
    assert.deepEqual(completenessOf(long, bare()).missing, ['summary'])
    assert.deepEqual(completenessOf(long, bare({ summary: { max: 0 } })).missing, [])
  })

  test('clearing the length floor drops the length requirement, never the text itself', () => {
    const noText = { ...fullDataset, description: '', summary: null }
    const config = bare({ description: { min: 0 }, summary: { min: 0, max: 0 } })
    assert.deepEqual(completenessOf(noText, config).missing, ['description', 'summary'])
    // a single character is enough once the floor is cleared, which is the point of a 0 bound
    assert.deepEqual(completenessOf({ ...noText, description: 'd', summary: 's' }, config).missing, [])
  })

  test('the applied length windows travel with the score, and only for criteria that count', () => {
    assert.deepEqual(completenessOf(fullDataset, bare()).lengths, {
      description: { min: 200 },
      summary: { min: 50, max: 250 }
    })
    assert.deepEqual(completenessOf(fullDataset, bare({ summary: { min: 10, max: 0 } })).lengths, {
      description: { min: 200 },
      summary: { min: 10 }
    })
    // a criterion removed from the calculation has no window to warn about either
    assert.deepEqual(completenessOf(fullDataset, bare({ weights: { description: 0 } })).lengths, {
      summary: { min: 50, max: 250 }
    })
  })

  test('the schema reference needs a title or a URL, a version alone identifies nothing', () => {
    const versionOnly = { ...fullDataset, conformsTo: { version: '1.2.0' } }
    // not offered in the owner settings: it cannot lower anything
    assert.equal(completenessOf(versionOnly, bare()).score, 100)
    assert.deepEqual(completenessOf(versionOnly, cfg()).missing, ['conformsTo'])
    assert.deepEqual(completenessOf({ ...fullDataset, conformsTo: { url: 'https://example.com/s.json' } }, cfg()).missing, [])
  })

  test('temporal coverage is satisfied by start alone as well as by end alone', () => {
    assert.deepEqual(completenessOf({ ...fullDataset, temporal: { start: '2026-01-01' } }, cfg()).missing, [])
    assert.deepEqual(completenessOf({ ...fullDataset, temporal: { end: '2026-12-31' } }, cfg()).missing, [])
    assert.deepEqual(completenessOf({ ...fullDataset, temporal: {} }, cfg()).missing, ['temporal'])
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
    assert.equal(completenessOf(cleared, cfg()).score, 0)
    assert.equal(completenessOf(cleared, cfg()).missing.length, 11)
  })

  test('missing follows the configured weights, not the declaration order', () => {
    const result = completenessOf({}, cfg({ weights: { description: 1, origin: 9 } }))
    assert.equal(result.missing[0], 'origin')
    assert.equal(result.missing.at(-1), 'conformsTo')
    assert.equal(result.score, 0)
  })

  test('equal weights fall back to the canonical key order, so missing is deterministic', () => {
    const weights = Object.fromEntries(COMPLETENESS_KEYS.map(k => [k, 1]))
    assert.deepEqual(completenessOf({}, cfg({ weights })).missing, COMPLETENESS_KEYS)
  })

  test('an all-zero configuration returns nothing rather than a 0 % nobody can raise', () => {
    const weights = Object.fromEntries(COMPLETENESS_KEYS.map(k => [k, 0]))
    assert.equal(computeCompleteness(fullDataset, cfg({ weights })), undefined)
    // same when every weighted criterion is gated off rather than zeroed
    assert.equal(computeCompleteness(fullDataset, {
      config: { weights: { description: 0, summary: 0, license: 0, origin: 0 } },
      datasetsMetadata: {},
      hasTopics: false
    }), undefined)
  })

  test('the score is rounded to the nearest integer', () => {
    // description (4) + summary (3) filled of 11 applicable => 63.63... => 64
    assert.equal(completenessOf({ description: 'd'.repeat(200), summary: 's'.repeat(100) }, bare()).score, 64)
  })
})

test.describe('validateMetadataCompleteness', () => {
  test('an inactive configuration is never rejected, whatever it holds', () => {
    assert.equal(validateMetadataCompleteness(bare({ description: { min: 500, max: 200 } })), undefined)
  })

  test('a length window no text could satisfy is refused', () => {
    const error = validateMetadataCompleteness(bare({ active: true, description: { min: 500, max: 200 } }))
    assert.match(error ?? '', /longueur minimale/)
    // the default max of the summary is 250, so a min above it is reachable without setting both
    assert.match(validateMetadataCompleteness(bare({ active: true, summary: { min: 300 } })) ?? '', /longueur minimale/)
  })

  test('a configuration where nothing applicable is weighted is refused', () => {
    const weights = Object.fromEntries(COMPLETENESS_KEYS.map(k => [k, 0]))
    assert.match(validateMetadataCompleteness(cfg({ active: true, weights })) ?? '', /poids supérieur à 0/)
    // weighting only criteria whose field is not offered is just as empty
    assert.match(validateMetadataCompleteness(bare({
      active: true,
      weights: { description: 0, summary: 0, license: 0, origin: 0 }
    })) ?? '', /poids supérieur à 0/)
  })

  test('a usable configuration passes', () => {
    assert.equal(validateMetadataCompleteness(bare({ active: true })), undefined)
    assert.equal(validateMetadataCompleteness(cfg({ active: true, weights: { description: 0 } })), undefined)
  })
})
