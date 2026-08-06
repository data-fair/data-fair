import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { buildIndexMappings } from '../../../../api/src/datasets/es/operations.ts'

const stringField = (key: string, extra: any = {}) => ({ key, type: 'string', ...extra })

// indexDefinition's pure mapping builder: we pass a placeholder analyzer string — only the
// catch-all `_search` field carries it, and the unit tests don't assert on its value.
const ANALYZER = 'placeholder'

test.describe('buildIndexMappings - catch-all _search field', () => {
  test('narrow dataset: no _search field, no copy_to', () => {
    const dataset: any = { id: 'narrow', schema: Array.from({ length: 5 }, (_, i) => stringField('f' + i)), extensions: [] }
    const { properties } = buildIndexMappings(dataset, dataset.schema, ANALYZER)
    assert.equal(properties._search, undefined)
    assert.equal(properties.f0.copy_to, undefined)
  })

  test('wide dataset: _search defined, copy_to only on non-boost-eligible text columns', () => {
    const schema = [
      ...Array.from({ length: 32 }, (_, i) => stringField('f' + i)),
      stringField('label_col', { 'x-refersTo': 'http://www.w3.org/2000/01/rdf-schema#label' }),
      { key: 'a_bool', type: 'boolean' }
    ]
    const dataset: any = { id: 'wide', schema, extensions: [] }
    const { properties } = buildIndexMappings(dataset, schema, ANALYZER)
    assert.equal(properties._search.type, 'text')
    assert.equal(properties._search.fields.text_standard.analyzer, 'standard')
    // _search_boosted is intentionally not created; the per-field ^3/^2 boost is applied at query time
    assert.equal(properties._search_boosted, undefined)
    assert.equal(properties.f0.copy_to, '_search')
    // boost-eligible columns are queried per-field with their boost suffix; no point copying them into _search
    assert.equal(properties.label_col.copy_to, undefined)
    // a boolean column has no text inner field -> not copied
    assert.equal(properties.a_bool.copy_to, undefined)
  })
})
