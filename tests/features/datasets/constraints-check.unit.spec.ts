import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { checkConstraints, unicityViolationMessage } from '../../../api/src/datasets/utils/constraints.ts'

const schema = [
  { key: 'a', type: 'string' },
  { key: 'b', type: 'integer' },
  { key: 'calc', type: 'string', 'x-calculated': true },
  { key: 'noval', type: 'string', 'x-capabilities': { values: false } },
  { key: 'geom', type: 'string', 'x-refersTo': 'https://purl.org/geojson/vocab#geometry' },
  { key: 'obj', type: 'object' },
  { key: 'm', type: 'string', separator: ',' }
]

test.describe('checkConstraints', () => {
  test('accepts a valid multi-column unique constraint', () => {
    assert.doesNotThrow(() => checkConstraints(schema, [{ type: 'unique', properties: ['a', 'b'] }]))
  })

  test('rejects a nonexistent column', () => {
    assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: ['nope'] }]), /nope/)
  })

  test('rejects a calculated column', () => {
    assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: ['calc'] }]), /calcul/i)
  })

  test('rejects a column without the values capability', () => {
    assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: ['noval'] }]), /group/i)
  })

  test('rejects a geometry column', () => {
    assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: ['geom'] }]), /géométrie/i)
  })

  test('rejects an object column', () => {
    assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: ['obj'] }]), /objet/i)
  })

  test('rejects a multi-valued (separator) column', () => {
    assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: ['m'] }]), /multivalu/i)
  })

  test('rejects an empty properties list', () => {
    assert.throws(() => checkConstraints(schema, [{ type: 'unique', properties: [] }]), /au moins une colonne/i)
  })

  test('is a no-op for empty/absent constraints', () => {
    assert.doesNotThrow(() => checkConstraints(schema, []))
  })
})

test.describe('unicityViolationMessage', () => {
  const titledSchema = [
    { key: 'poste', type: 'string', title: 'Poste' },
    { key: 'siret', type: 'string', title: 'SIRET' },
    { key: 'annee', type: 'integer' }
  ]

  test('single column: names the field and states the rule', () => {
    assert.equal(
      unicityViolationMessage(['poste'], titledSchema),
      'Doublon détecté : le champ (Poste) contient déjà cette valeur. Chaque valeur de la colonne Poste doit être unique.'
    )
  })

  test('two columns: "le couple"', () => {
    assert.equal(
      unicityViolationMessage(['poste', 'siret'], titledSchema),
      'Doublon détecté : le couple (Poste + SIRET) doit être unique.'
    )
  })

  test('three or more columns: "la combinaison"', () => {
    assert.equal(
      unicityViolationMessage(['poste', 'siret', 'annee'], titledSchema),
      'Doublon détecté : la combinaison (Poste + SIRET + annee) doit être unique.'
    )
  })

  test('falls back to the column key when there is no title or no schema', () => {
    assert.equal(
      unicityViolationMessage(['annee'], titledSchema),
      'Doublon détecté : le champ (annee) contient déjà cette valeur. Chaque valeur de la colonne annee doit être unique.'
    )
    assert.equal(
      unicityViolationMessage(['a', 'b']),
      'Doublon détecté : le couple (a + b) doit être unique.'
    )
  })
})

test.describe('checkConstraints dateCoherence', () => {
  const START = 'https://schema.org/startDate'
  const END = 'https://schema.org/endDate'
  const okSchema = [
    { key: 'deb', type: 'string', format: 'date', 'x-refersTo': START },
    { key: 'fin', type: 'string', format: 'date-time', 'x-refersTo': END }
  ]

  test('accepts when both concepts are on date columns', () => {
    assert.doesNotThrow(() => checkConstraints(okSchema, [{ type: 'dateCoherence' }]))
  })

  test('rejects when a concept column is missing', () => {
    assert.throws(() => checkConstraints([okSchema[0]], [{ type: 'dateCoherence' }]), /concept/i)
    assert.throws(() => checkConstraints([], [{ type: 'dateCoherence' }]), /concept/i)
  })

  test('rejects a calculated or extension concept column', () => {
    assert.throws(() => checkConstraints(
      [{ ...okSchema[0], 'x-calculated': true }, okSchema[1]],
      [{ type: 'dateCoherence' }]), /calcul/i)
    assert.throws(() => checkConstraints(
      [okSchema[0], { ...okSchema[1], 'x-extension': 'foo' }],
      [{ type: 'dateCoherence' }]), /calcul|enrichissement/i)
  })

  test('rejects a concept column that is not date / date-time formatted', () => {
    assert.throws(() => checkConstraints(
      [{ key: 'deb', type: 'string', 'x-refersTo': START }, okSchema[1]],
      [{ type: 'dateCoherence' }]), /date/i)
  })

  test('rejects a multi-valued (separator) concept column', () => {
    assert.throws(() => checkConstraints(
      [{ ...okSchema[0], separator: ',' }, okSchema[1]],
      [{ type: 'dateCoherence' }]), /multivalu/i)
    assert.throws(() => checkConstraints(
      [okSchema[0], { ...okSchema[1], separator: ',' }],
      [{ type: 'dateCoherence' }]), /multivalu/i)
  })

  test('rejects a duplicate dateCoherence constraint', () => {
    assert.throws(() => checkConstraints(okSchema, [{ type: 'dateCoherence' }, { type: 'dateCoherence' }]), /seule/i)
  })

  test('rejects on virtual datasets with the generalized message', () => {
    assert.throws(() => checkConstraints(okSchema, [{ type: 'dateCoherence' }], { isVirtual: true }), /virtuels/i)
  })
})
