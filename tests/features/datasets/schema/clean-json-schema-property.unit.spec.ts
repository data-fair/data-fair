import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { cleanJsonSchemaProperty } from '../../../../shared/schema.js'

test.describe('cleanJsonSchemaProperty unit tests', () => {
  test('preserves x-group on multi-value field in flatArrays mode (flat separator)', () => {
    const prop = {
      key: 'type_de_public',
      type: 'string',
      title: 'Type de public',
      description: 'Public concerné',
      separator: ',',
      'x-group': 'Descriptif de la salle'
    }
    const cleanProp = cleanJsonSchemaProperty(prop, 'http://localhost:5888', 'http://localhost:5888', true)
    assert.equal(cleanProp['x-group'], 'Descriptif de la salle')
    assert.equal(cleanProp.type, 'string')
    assert.deepEqual(cleanProp.layout, { separator: ',' })
  })

  test('preserves x-group on multi-value field with x-display in flatArrays mode', () => {
    const prop = {
      key: 'equipements_disponibles',
      type: 'string',
      title: 'Équipements disponibles',
      separator: ',',
      'x-display': 'textarea',
      'x-group': 'Descriptif de la salle'
    }
    const cleanProp = cleanJsonSchemaProperty(prop, 'http://localhost:5888', 'http://localhost:5888', true)
    assert.equal(cleanProp['x-group'], 'Descriptif de la salle')
    assert.equal(cleanProp['x-display'], 'textarea')
  })

  test('omits x-group if not defined on multi-value field in flatArrays mode', () => {
    const prop = {
      key: 'tags',
      type: 'string',
      title: 'Tags',
      separator: ','
    }
    const cleanProp = cleanJsonSchemaProperty(prop, 'http://localhost:5888', 'http://localhost:5888', true)
    assert.equal(cleanProp['x-group'], undefined)
    assert.equal(JSON.parse(JSON.stringify(cleanProp))['x-group'], undefined)
  })

  test('preserves x-group on array and removes from items in non-flat arrays mode (flatArrays: false)', () => {
    const prop = {
      key: 'type_de_public',
      type: 'string',
      title: 'Type de public',
      description: 'Public concerné',
      separator: ',',
      'x-group': 'Descriptif de la salle'
    }
    const cleanProp = cleanJsonSchemaProperty(prop, 'http://localhost:5888', 'http://localhost:5888', false)
    assert.equal(cleanProp.type, 'array')
    assert.equal(cleanProp['x-group'], 'Descriptif de la salle')
    assert.equal(cleanProp.items.type, 'string')
    assert.equal(cleanProp.items['x-group'], undefined)
  })
})
