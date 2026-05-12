import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { indexDefinition } from '../../../../api/src/datasets/es/manage-indices.js'

const stringField = (key: string, extra: any = {}) => ({ key, type: 'string', ...extra })

test.describe('indexDefinition - catch-all _search field', () => {
  test('narrow dataset: no _search field, no copy_to', async () => {
    const dataset: any = { id: 'narrow', schema: Array.from({ length: 5 }, (_, i) => stringField('f' + i)), extensions: [] }
    const body = await indexDefinition(dataset)
    assert.equal(body.mappings.properties._search, undefined)
    assert.equal(body.mappings.properties._search_boosted, undefined)
    assert.equal(body.mappings.properties.f0.copy_to, undefined)
  })

  test('wide dataset: _search + _search_boosted defined, copy_to on text columns', async () => {
    const schema = [
      ...Array.from({ length: 32 }, (_, i) => stringField('f' + i)),
      stringField('label_col', { 'x-refersTo': 'http://www.w3.org/2000/01/rdf-schema#label' }),
      { key: 'a_bool', type: 'boolean' }
    ]
    const dataset: any = { id: 'wide', schema, extensions: [] }
    const body = await indexDefinition(dataset)
    assert.equal(body.mappings.properties._search.type, 'text')
    assert.equal(body.mappings.properties._search.fields.text_standard.analyzer, 'standard')
    assert.equal(body.mappings.properties._search_boosted.type, 'text')
    assert.equal(body.mappings.properties.f0.copy_to, '_search')
    assert.deepEqual(body.mappings.properties.label_col.copy_to, ['_search', '_search_boosted'])
    // a boolean column has no text inner field -> not copied
    assert.equal(body.mappings.properties.a_bool.copy_to, undefined)
  })
})
