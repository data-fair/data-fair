import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { completenessCriteria, computeCompleteness, scoredFields } from '../../../api/types/metadata-completeness.ts'

const active = { completeness: { active: true } }
const longText = (n: number) => 'x'.repeat(n)

test.describe('metadata completeness', () => {
  test('no score unless the owner activated it', () => {
    assert.equal(computeCompleteness({ summary: 'a' }, {}), undefined)
    assert.equal(computeCompleteness({ summary: 'a' }, null), undefined)
    assert.equal(computeCompleteness({ summary: 'a' }, { completeness: { active: false } }), undefined)
  })

  test('a fragment has no score', () => {
    assert.equal(computeCompleteness({ partOf: { type: 'dataset', id: 'parent' } }, active), undefined)
  })

  test('scored fields come from the settings entries carrying a weight', () => {
    assert.ok(scoredFields.includes('summary'))
    assert.ok(scoredFields.includes('keywords'))
    assert.ok(!scoredFields.includes('custom'))
    assert.ok(!scoredFields.includes('groups'))
    assert.ok(!scoredFields.includes('completeness'))
  })

  test('default weights apply to the metadata shown by default', () => {
    // summary 3, description 4, license 3, origin 1, image 1, topics 2: the toggleable ones are off by default
    assert.deepEqual(completenessCriteria({}, active).map(c => [c.key, c.weight]),
      [['summary', 3], ['description', 4], ['license', 3], ['origin', 1], ['image', 1], ['topics', 2]])
    assert.equal(computeCompleteness({}, active), 0)
    assert.equal(computeCompleteness({
      summary: longText(100),
      description: longText(600),
      license: { title: 'Licence ouverte', href: 'https://www.etalab.gouv.fr/licence-ouverte' },
      origin: 'https://example.com',
      image: 'https://example.com/image.png',
      topics: [{ id: 't1', title: 'Topic' }]
    }, active), 100)
  })

  test('a filled metadata outside its recommended bounds counts for half', () => {
    const settings = { ...active, summary: { weight: 1 }, description: { weight: 0 }, license: { weight: 0 }, origin: { weight: 0 }, image: { weight: 0 }, topics: { weight: 0 } }
    assert.equal(computeCompleteness({ summary: longText(10) }, settings), 50)
    assert.equal(computeCompleteness({ summary: longText(301) }, settings), 50)
    assert.equal(computeCompleteness({ summary: longText(200) }, settings), 100)
    // blank text is empty
    assert.equal(computeCompleteness({ summary: '   ' }, settings), 0)
    // the owner bounds replace the defaults
    assert.equal(computeCompleteness({ summary: longText(10) }, { ...settings, summary: { weight: 1, recommendedMin: 5 } }), 100)
  })

  test('lists are measured in values, objects are only filled or empty', () => {
    const settings = { ...active, summary: { weight: 0 }, description: { weight: 0 }, license: { weight: 0 }, origin: { weight: 0 }, image: { weight: 0 }, topics: { weight: 0 }, keywords: { active: true, recommendedMin: 3 }, temporal: { active: true } }
    const criteria = completenessCriteria({ keywords: ['a'], temporal: { start: '2020-01-01' } }, settings)
    assert.deepEqual(criteria.map(c => [c.key, c.size, c.note]), [['temporal', undefined, 1], ['keywords', 1, 0.5]])
    assert.equal(computeCompleteness({ keywords: [], temporal: { start: '', end: null } }, settings), 0)
  })

  test('custom metadata weigh 1 by default, 0 removes them', () => {
    const settings = {
      ...active,
      summary: { weight: 0 },
      description: { weight: 0 },
      license: { weight: 0 },
      origin: { weight: 0 },
      image: { weight: 0 },
      topics: { weight: 0 },
      custom: [
        { key: 'service', title: 'Service' },
        { key: 'contact', title: 'Contact', type: 'link' },
        { key: 'effectif', title: 'Effectif', type: 'integer', weight: 2 },
        { key: 'ignored', title: 'Ignored', weight: 0 }
      ]
    }
    const dataset = { customMetadata: { service: 'Voirie', contact: { url: '' }, effectif: 0, ignored: 'x' } }
    assert.deepEqual(completenessCriteria(dataset, settings).map(c => [c.key, c.custom, c.weight, c.note]),
      [['service', true, 1, 1], ['contact', true, 1, 0], ['effectif', true, 2, 1]])
    assert.equal(computeCompleteness(dataset, settings), 75)
  })

  test('nothing weighted means no score', () => {
    const settings = { ...active, summary: { weight: 0 }, description: { weight: 0 }, license: { weight: 0 }, origin: { weight: 0 }, image: { weight: 0 }, topics: { weight: 0 } }
    assert.equal(computeCompleteness({ summary: 'a' }, settings), undefined)
  })
})
