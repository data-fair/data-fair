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
import { buildStructuredContent, schema as describeDatasetSchema } from '../../../agent-tools/describe-dataset.ts'

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

  test('searchTerms: trimmed, capped, gated by datasets-metadata like keywords', () => {
    const { patch, outcomes } = buildMetadataPatch({ searchTerms: '  HLM, logement social\nhabitat social  ' }, { title: 'x' }, ctx)
    assert.equal(patch.searchTerms, 'HLM, logement social\nhabitat social')
    assert.deepEqual(outcomes, [{ field: 'searchTerms', status: 'applied' }])

    const tooLong = buildMetadataPatch({ searchTerms: 'x'.repeat(1001) }, {}, ctx)
    assert.equal(tooLong.patch.searchTerms, undefined)
    assert.equal(tooLong.outcomes[0].status, 'rejected')
    assert.match(tooLong.outcomes[0].reason!, /1000/)

    const disabled = buildMetadataPatch({ searchTerms: 'a' }, {}, { ...ctx, datasetsMetadata: { searchTerms: { active: false } } })
    assert.equal(disabled.outcomes[0].status, 'rejected')
    assert.ok(disabled.outcomes[0].reason!.includes('disabled'))

    const missingSetting = buildMetadataPatch({ searchTerms: 'a' }, {}, { ...ctx, datasetsMetadata: { keywords: { active: true } } })
    assert.equal(missingSetting.outcomes[0].status, 'applied', 'a missing searchTerms setting means active')
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

  test('the context reports searchTerms and says it is hidden', () => {
    const text = formatMetadataContext({ title: 'T', searchTerms: 'élections scrutin' }, ctx)
    assert.match(text, /searchTerms: élections scrutin/)
    assert.match(text, /never displayed/)
  })
})

test.describe('buildStructuredContent on a freshly created REST dataset', () => {
  // A dataset created by the wizard has no rows and no public page yet, so
  // `count` and `page` are absent from the API response. They were assigned
  // unconditionally while every other field was guarded, leaving keys whose
  // value is literally `undefined` — which the host rejects with
  // "Instances of 'undefined' type are not supported", so describe_dataset
  // threw the moment the assistant looked at a dataset it had just helped
  // create. A judged simulation caught it; the assistant swallowed the error
  // and carried on guessing.
  const freshRest = { id: 'abc', title: 'Demandes de subvention', isRest: true, schema: [] }

  test('emits no key whose value is undefined', () => {
    const content = buildStructuredContent(freshRest)
    const undefinedKeys = Object.entries(content).filter(([, v]) => v === undefined).map(([k]) => k)
    assert.deepEqual(undefinedKeys, [], `undefined-valued keys: ${undefinedKeys.join(', ')}`)
  })

  test('survives a round trip through JSON, as the wire requires', () => {
    const content = buildStructuredContent(freshRest)
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(content)))
    assert.equal(JSON.parse(JSON.stringify(content)).title, 'Demandes de subvention')
  })

  test('still reports count and page when the API does supply them', () => {
    const content = buildStructuredContent({ ...freshRest, count: 12 }, undefined, 'https://example.org/data-fair/dataset/abc')
    assert.equal(content.count, 12)
    assert.equal(content.page, 'https://example.org/data-fair/dataset/abc')
  })
})

test.describe('describe_dataset output honours its own declared contract', () => {
  // Both halves of a real failure: first the builder emitted keys valued
  // `undefined` ("Instances of 'undefined' type are not supported"), then,
  // once guarded, the declared `required` list still demanded them
  // ("Instance does not have required property \"count\""). Checking the
  // built object against the declared schema catches either direction.
  const required = describeDatasetSchema.outputSchema.required as readonly string[]

  test('a freshly created REST dataset satisfies every required property', () => {
    const content = buildStructuredContent({ id: 'abc', title: 'Demandes de subvention', isRest: true, schema: [] })
    const missing = required.filter(k => content[k] === undefined)
    assert.deepEqual(missing, [], `declared required but absent: ${missing.join(', ')}`)
  })

  test('a fully populated dataset also satisfies it', () => {
    const content = buildStructuredContent(
      { id: 'abc', title: 'Équipements', count: 7, schema: [{ key: 'nom', type: 'string' }] },
      undefined,
      'https://example.org/data-fair/dataset/abc'
    )
    assert.deepEqual(required.filter(k => content[k] === undefined), [])
  })
})
