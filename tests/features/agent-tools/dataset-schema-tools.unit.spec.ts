import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  applyAnnotations,
  isConceptEligible,
  resolveConcept,
  formatVocabulary
} from '../../../ui/src/composables/dataset/agent-schema-annotation-tools-logic.ts'
import { applyColumnLabels, isLabellable } from '../../../ui/src/composables/dataset/agent-column-labels-tools-logic.ts'
import { reorderSchema } from '../../../ui/src/composables/dataset/agent-schema-order-tools-logic.ts'
import { diffDataset } from '../../../ui/src/composables/dataset/agent-changes-summary-logic.ts'

const vocabulary = [
  { id: 'codeCommune', title: 'Code commune', identifiers: ['http://rdf.insee.fr/def/geo#codeCommune'], type: 'string', tag: 'Territoire' },
  { id: 'latitude', title: 'Latitude', identifiers: ['http://schema.org/latitude'], type: 'number', tag: 'Territoire' },
  { id: 'startDate', title: 'Date de début', identifiers: ['http://schema.org/startDate'], type: 'string', format: 'date-time', tag: 'Temps' }
]

const makeSchema = () => [
  { key: 'codgeo', type: 'string' },
  { key: 'libgeo', type: 'string', title: 'Nom Commune' },
  { key: 'sexe', type: 'integer', enum: [1, 2] },
  { key: 'nb', type: 'number' },
  { key: '_id', type: 'string' },
  { key: '_i', type: 'integer' }
]

test.describe('isConceptEligible', () => {
  test('accepts a string concept on a string column', () => {
    assert.equal(isConceptEligible({ key: 'codgeo', type: 'string' }, vocabulary[0], []), true)
  })

  test('accepts a number concept on an integer column', () => {
    assert.equal(isConceptEligible({ key: 'x', type: 'integer' }, vocabulary[1], []), true)
  })

  test('refuses a number concept on a string column', () => {
    const res = isConceptEligible({ key: 'x', type: 'string' }, vocabulary[1], [])
    assert.notEqual(res, true)
    assert.ok(String(res).includes('expects a number column'))
  })

  test('refuses a date concept on a column with no date format', () => {
    const res = isConceptEligible({ key: 'x', type: 'string' }, vocabulary[2], [])
    assert.ok(String(res).includes('expects a date column'))
  })

  test('refuses a concept already carried by another column', () => {
    const cols = [{ key: 'other', type: 'string', 'x-refersTo': 'http://rdf.insee.fr/def/geo#codeCommune' }]
    const res = isConceptEligible({ key: 'codgeo', type: 'string' }, vocabulary[0], cols)
    assert.ok(String(res).includes('already carried by column "other"'))
  })
})

test.describe('resolveConcept', () => {
  test('resolves by identifier, id and title', () => {
    assert.equal(resolveConcept('http://schema.org/latitude', vocabulary)!.id, 'latitude')
    assert.equal(resolveConcept('codeCommune', vocabulary)!.id, 'codeCommune')
    assert.equal(resolveConcept('code commune', vocabulary)!.id, 'codeCommune')
  })
})

test.describe('applyAnnotations', () => {
  test('writes title, description, concept and group in one call', () => {
    const schema = makeSchema()
    const outcomes = applyAnnotations(schema, [
      { key: 'codgeo', title: 'Code commune', concept: 'codeCommune', group: 'Géographie' },
      { key: 'sexe', title: 'Sexe', description: 'Sexe de la personne.' }
    ], vocabulary)
    const codgeo = schema.find(c => c.key === 'codgeo')!
    assert.equal(codgeo.title, 'Code commune')
    assert.equal(codgeo['x-refersTo'], 'http://rdf.insee.fr/def/geo#codeCommune')
    assert.equal(codgeo['x-group'], 'Géographie')
    assert.deepEqual(outcomes[0].applied, ['title', 'group', 'concept'])
  })

  test('keeps the valid fields of a column whose concept is refused', () => {
    const schema = makeSchema()
    const outcomes = applyAnnotations(schema, [
      { key: 'codgeo', title: 'Code commune', concept: 'latitude' }
    ], vocabulary)
    assert.equal(schema.find(c => c.key === 'codgeo')!.title, 'Code commune')
    assert.deepEqual(outcomes[0].applied, ['title'])
    assert.equal(outcomes[0].rejected[0].field, 'concept')
  })

  test('refuses to annotate an internal column', () => {
    const schema = makeSchema()
    const outcomes = applyAnnotations(schema, [{ key: '_i', title: 'Ligne' }], vocabulary)
    assert.ok(outcomes[0].rejected[0].reason.includes('internal or calculated'))
  })

  test('refuses an unknown column rather than creating one', () => {
    const schema = makeSchema()
    const before = schema.length
    const outcomes = applyAnnotations(schema, [{ key: 'nope', title: 'X' }], vocabulary)
    assert.equal(schema.length, before)
    assert.ok(outcomes[0].rejected[0].reason.includes('no column "nope"'))
  })

  test('clears a concept and its denormalized copy when passed an empty string', () => {
    const schema = makeSchema()
    const col = schema.find(c => c.key === 'codgeo')! as any
    col['x-refersTo'] = 'http://rdf.insee.fr/def/geo#codeCommune'
    col['x-concept'] = { id: 'codeCommune', title: 'Code commune' }
    applyAnnotations(schema, [{ key: 'codgeo', concept: '' }], vocabulary)
    assert.equal(col['x-refersTo'], undefined)
    assert.equal(col['x-concept'], undefined)
  })
})

test.describe('formatVocabulary', () => {
  test('flags a concept already taken so the model does not retry it', () => {
    const schema = [{ key: 'a', type: 'string', 'x-refersTo': 'http://rdf.insee.fr/def/geo#codeCommune' }]
    const out = formatVocabulary(vocabulary, schema)
    assert.ok(out.includes('already on `a`'))
  })
})

test.describe('column labels', () => {
  test('stores values as strings, including for an integer column', () => {
    const schema = makeSchema()
    applyColumnLabels(schema, [{ key: 'sexe', labels: { 1: 'Homme', 2: 'Femme' } as any }])
    assert.deepEqual(schema.find(c => c.key === 'sexe')!['x-labels'], { 1: 'Homme', 2: 'Femme' })
  })

  test('merges over existing labels instead of wiping the others', () => {
    const schema = makeSchema()
    const col = schema.find(c => c.key === 'sexe')! as any
    col['x-labels'] = { 1: 'hommes', 2: 'femmes' }
    applyColumnLabels(schema, [{ key: 'sexe', labels: { 1: 'Homme' } }])
    assert.deepEqual(col['x-labels'], { 1: 'Homme', 2: 'femmes' })
  })

  test('warns about a labelled value never observed in the data', () => {
    const schema = makeSchema()
    const outcomes = applyColumnLabels(schema, [{ key: 'sexe', labels: { 3: 'Autre' } }])
    assert.deepEqual(outcomes[0].unknownValues, ['3'])
  })

  test('refuses a high-cardinality column', () => {
    const res = isLabellable({ key: 'nom', type: 'string', 'x-cardinality': 5000 })
    assert.ok(String(res).includes('closed set of codes'))
  })

  test('clears the labels when passed an empty object', () => {
    const schema = makeSchema()
    const col = schema.find(c => c.key === 'sexe')! as any
    col['x-labels'] = { 1: 'Homme' }
    applyColumnLabels(schema, [{ key: 'sexe', labels: {} }])
    assert.equal(col['x-labels'], undefined)
  })
})

test.describe('reorderSchema', () => {
  test('reorders the editable columns and keeps the internal ones last', () => {
    const schema = makeSchema()
    const { schema: out, movedCount } = reorderSchema(schema, ['libgeo', 'codgeo', 'sexe', 'nb'])
    assert.deepEqual(out!.map(c => c.key), ['libgeo', 'codgeo', 'sexe', 'nb', '_id', '_i'])
    assert.equal(movedCount, 2)
  })

  test('refuses an incomplete order rather than dropping columns', () => {
    const { error, schema: out } = reorderSchema(makeSchema(), ['libgeo', 'codgeo'])
    assert.equal(out, undefined)
    assert.ok(error!.includes('missing'))
    assert.ok(error!.includes('never drops'))
  })

  test('refuses an unknown key', () => {
    const { error } = reorderSchema(makeSchema(), ['libgeo', 'codgeo', 'sexe', 'nb', 'ghost'])
    assert.ok(error!.includes('unknown column'))
  })

  test('refuses a duplicated key', () => {
    const { error } = reorderSchema(makeSchema(), ['codgeo', 'codgeo', 'libgeo', 'sexe', 'nb'])
    assert.ok(error!.includes('duplicate'))
  })

  test('reports no movement when the order is already the current one', () => {
    const { movedCount } = reorderSchema(makeSchema(), ['codgeo', 'libgeo', 'sexe', 'nb'])
    assert.equal(movedCount, 0)
  })
})

test.describe('diffDataset', () => {
  test('reports nothing when both sides are identical', () => {
    const d = { schema: makeSchema() }
    assert.equal(diffDataset({ structureServer: d, structureEdited: JSON.parse(JSON.stringify(d)) }), 'Aucune modification en attente.')
  })

  test('reports the metadata fields that changed', () => {
    const out = diffDataset({
      metadataServer: { title: 'A', keywords: [] },
      metadataEdited: { title: 'B', keywords: ['insee'] }
    })
    assert.ok(out.includes('**titre** : A → B'))
    assert.ok(out.includes('**mots-clés**'))
  })

  test('reports what the old text diff could not see: capabilities, groups and labels', () => {
    const server = { schema: makeSchema() }
    const edited = JSON.parse(JSON.stringify(server))
    edited.schema[0]['x-capabilities'] = { text: false }
    edited.schema[0]['x-group'] = 'Géographie'
    edited.schema[2]['x-labels'] = { 1: 'Homme' }
    const out = diffDataset({ structureServer: server, structureEdited: edited })
    assert.ok(out.includes('capacités'))
    assert.ok(out.includes('groupe'))
    assert.ok(out.includes('libellés de valeurs'))
  })

  test('reports a pure reorder, which the column chips alone would not show', () => {
    const server = { schema: makeSchema() }
    const edited = { schema: [server.schema[1], server.schema[0], ...server.schema.slice(2)] }
    const out = diffDataset({ structureServer: server, structureEdited: edited })
    assert.ok(out.includes('ordre des colonnes modifié'))
  })

  test('does not report an added column a second time as a move', () => {
    const server = { schema: makeSchema() }
    const edited = { schema: [...server.schema, { key: 'new', type: 'string' }] }
    const out = diffDataset({ structureServer: server, structureEdited: edited })
    assert.ok(out.includes('colonnes ajoutées'))
    assert.ok(!out.includes('ordre des colonnes modifié'))
  })
})
