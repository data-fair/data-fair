import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  buildMetadataPatch,
  validateSummary,
  resolveLicense,
  resolveTopic,
  formatMetadataContext,
  SUMMARY_MAX_LENGTH
} from '../../../ui/src/composables/dataset/agent-metadata-tools-logic.ts'

const licenses = [
  { title: 'Licence Ouverte / Open Licence', href: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence' },
  { title: 'ODbL', href: 'https://opendatacommons.org/licenses/odbl/' }
]
const topics = [
  { id: 'pop', title: 'Population et société' },
  { id: 'terr', title: 'Territoire' }
]
const ctx = { licenses, topics, datasetsMetadata: null }

test.describe('validateSummary', () => {
  test('accepts a concrete summary within the limit', () => {
    assert.equal(validateSummary('Recense les bornes de recharge en Bretagne.'), undefined)
  })

  test('says how much to cut instead of only reporting the length', () => {
    const err = validateSummary('x'.repeat(SUMMARY_MAX_LENGTH + 12))!
    assert.ok(err.includes('12 too many'))
    assert.ok(/Cut about \d+ characters/.test(err))
  })

  test('refuses a filler opening in both languages', () => {
    assert.ok(validateSummary('Ce jeu de données recense les équipements.')!.includes('filler phrase'))
    assert.ok(validateSummary('This dataset lists the facilities.')!.includes('filler phrase'))
  })

  test('refuses an empty summary', () => {
    assert.ok(validateSummary('   ')!.includes('empty'))
  })
})

test.describe('resolveLicense / resolveTopic', () => {
  test('resolve by href, by id and by title case-insensitively', () => {
    assert.equal(resolveLicense('https://opendatacommons.org/licenses/odbl/', licenses)!.title, 'ODbL')
    assert.equal(resolveLicense('odbl', licenses)!.href, 'https://opendatacommons.org/licenses/odbl/')
    assert.equal(resolveTopic('terr', topics)!.title, 'Territoire')
    assert.equal(resolveTopic('territoire', topics)!.id, 'terr')
  })

  test('return undefined for an unknown value rather than inventing one', () => {
    assert.equal(resolveLicense('CC-BY-SA', licenses), undefined)
    assert.equal(resolveTopic('Environnement', topics), undefined)
  })
})

test.describe('buildMetadataPatch', () => {
  test('applies the plain fields and reports them', () => {
    const { patch, outcomes } = buildMetadataPatch(
      { title: '  Population par âge  ', origin: 'INSEE' },
      { title: 'ancien' },
      ctx
    )
    assert.equal(patch.title, 'Population par âge')
    assert.equal(patch.origin, 'INSEE')
    assert.deepEqual(outcomes.map(o => o.status), ['applied', 'applied'])
  })

  test('reports a field already at that value as unchanged, and does not patch it', () => {
    const { patch, outcomes } = buildMetadataPatch({ title: 'Déjà bon' }, { title: 'Déjà bon' }, ctx)
    assert.deepEqual(patch, {})
    assert.equal(outcomes[0].status, 'unchanged')
  })

  test('stores a licence as the object shape the form produces', () => {
    const { patch } = buildMetadataPatch({ license: 'ODbL' }, {}, ctx)
    assert.deepEqual(patch.license, { title: 'ODbL', href: 'https://opendatacommons.org/licenses/odbl/' })
  })

  test('rejects an unknown licence and lists the allowed ones', () => {
    const { patch, outcomes } = buildMetadataPatch({ license: 'CC0' }, {}, ctx)
    assert.deepEqual(patch, {})
    const outcome = outcomes[0]
    assert.equal(outcome.status, 'rejected')
    assert.ok(outcome.reason!.includes('ODbL'))
  })

  test('rejects the whole topics list when one entry is unknown', () => {
    const { patch, outcomes } = buildMetadataPatch({ topics: ['Territoire', 'Transports'] }, {}, ctx)
    assert.deepEqual(patch, {})
    assert.ok(outcomes[0].reason!.includes('"Transports"'))
  })

  test('keeps valid fields when another one is rejected', () => {
    const { patch, outcomes } = buildMetadataPatch({ title: 'Bon titre', license: 'inconnue' }, {}, ctx)
    assert.equal(patch.title, 'Bon titre')
    assert.equal(outcomes.find(o => o.field === 'license')!.status, 'rejected')
  })

  test('refuses a field the organization has disabled, so nothing is saved unseen', () => {
    const restricted = { ...ctx, datasetsMetadata: { keywords: { active: false } } }
    const { patch, outcomes } = buildMetadataPatch({ keywords: ['insee'] }, {}, restricted)
    assert.deepEqual(patch, {})
    assert.ok(outcomes[0].reason!.includes('disabled'))
  })

  test('allows an optional field when the organization has no settings at all', () => {
    const { patch } = buildMetadataPatch({ keywords: ['insee', 'insee', ' recensement '] }, {}, ctx)
    assert.deepEqual(patch.keywords, ['insee', 'recensement'])
  })

  test('rejects an unknown update frequency', () => {
    const { outcomes } = buildMetadataPatch({ frequency: 'sometimes' }, {}, ctx)
    assert.equal(outcomes[0].status, 'rejected')
    assert.ok(outcomes[0].reason!.includes('annual'))
  })

  test('clears a licence when passed null', () => {
    const { patch } = buildMetadataPatch({ license: null }, { license: { title: 'ODbL' } }, ctx)
    assert.equal(patch.license, null)
  })
})

test.describe('formatMetadataContext', () => {
  test('hands the model the closed vocabularies instead of letting it guess', () => {
    const out = formatMetadataContext({ title: 'T', keywords: [] }, ctx)
    assert.ok(out.includes('Licence Ouverte / Open Licence'))
    assert.ok(out.includes('Population et société'))
    assert.ok(out.includes('annual'))
  })

  test('names the fields the organization disabled', () => {
    const out = formatMetadataContext({ title: 'T' }, { ...ctx, datasetsMetadata: { creator: { active: false } } })
    assert.ok(out.includes('disabled in this organization'))
    assert.ok(out.includes('creator'))
  })

  test('says so when the organization configured no licence', () => {
    const out = formatMetadataContext({ title: 'T' }, { ...ctx, licenses: [] })
    assert.ok(out.includes('none configured'))
  })
})
