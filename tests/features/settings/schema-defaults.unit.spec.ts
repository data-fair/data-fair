import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { settingsSchema } from '../../../api/types/index.ts'
import { withSchemaDefaults } from '../../../ui/src/utils/schema-defaults.ts'

const schema = {
  type: 'object',
  properties: {
    flag: { type: 'boolean', default: false },
    untouched: { type: 'string' },
    nested: { type: 'object', properties: { list: { type: 'array', default: [] } } },
    empty: { type: 'object', properties: { label: { type: 'string' } } },
    lines: {
      type: 'array',
      items: { type: 'object', properties: { type: { type: 'string', default: 'string' }, title: { type: 'string' } } }
    }
  }
}

test.describe('withSchemaDefaults', () => {
  test('fills missing defaults, down objects and array items', () => {
    assert.deepEqual(withSchemaDefaults({ lines: [{ title: 'a' }, { title: 'b', type: 'date' }] }, schema), {
      flag: false,
      nested: { list: [] },
      lines: [{ title: 'a', type: 'string' }, { title: 'b', type: 'date' }]
    })
  })

  test('keeps stored values, falsy ones included', () => {
    assert.deepEqual(withSchemaDefaults({ flag: true, nested: { list: ['x'] } }, schema), { flag: true, nested: { list: ['x'] } })
    assert.equal(withSchemaDefaults({ flag: false }, { properties: { flag: { default: true } } }).flag, false)
  })

  test('creates no object without a default inside', () => {
    assert.equal('empty' in withSchemaDefaults({}, schema), false)
  })

  test('starts from nothing', () => {
    assert.deepEqual(withSchemaDefaults(undefined, schema), { flag: false, nested: { list: [] } })
  })

  test('does not change its input, nor share the defaults', () => {
    const input = { lines: [{ title: 'a' }] }
    const result = withSchemaDefaults(input, schema)
    assert.deepEqual(input, { lines: [{ title: 'a' }] })
    result.nested.list.push('x')
    assert.deepEqual(withSchemaDefaults({}, schema).nested.list, [])
  })

  test('fills what vjsf adds when a settings line opens', () => {
    const filled = withSchemaDefaults({
      publicationSites: [{ type: 'data-fair-portals', id: 'demo', url: 'http://test.com' }],
      privateVocabulary: [{ title: 'concept' }],
      datasetsMetadata: { custom: [{ title: 'custom', key: 'custom' }] }
    }, settingsSchema)
    assert.equal(filled.publicationSites[0].private, false)
    assert.deepEqual(filled.publicationSites[0].settings, { staging: false, contributorDepartments: [] })
    assert.equal(filled.privateVocabulary[0].type, 'string')
    assert.equal(filled.datasetsMetadata.custom[0].type, 'string')
    assert.equal(filled.datasetsMetadata.spatial.active, false)
    assert.equal(filled.datasetsMetadata.license.active, true)
  })
})
