import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { buildIndexMappings, esProperty, currentIndexShape, LEGACY_INDEX_SHAPE, NEW_INDEX_SHAPE } from '../../../../api/src/datasets/es/operations.ts'

const stringField = (key: string, extra: any = {}) => ({ key, type: 'string', ...extra })

// indexDefinition's pure mapping builder: we pass placeholder analyzer strings — only the
// catch-all `_search` field carries them, and the unit tests don't assert on their real value.
const ANALYZER = 'placeholder'
const INDEX_ANALYZER = 'placeholder-repeat'
const ANALYZERS = { search: ANALYZER, index: INDEX_ANALYZER }

test.describe('buildIndexMappings - catch-all _search field', () => {
  test('narrow dataset: no _search field, no copy_to', () => {
    const dataset: any = { id: 'narrow', schema: Array.from({ length: 5 }, (_, i) => stringField('f' + i)), extensions: [] }
    const { properties } = buildIndexMappings(dataset, dataset.schema, ANALYZERS)
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
    const { properties } = buildIndexMappings(dataset, schema, ANALYZERS)
    assert.equal(properties._search.type, 'text')
    // new shape: single analyzed field on _search too — no `.text_standard` subfield
    assert.equal(properties._search.fields, undefined)
    assert.equal(properties._search.analyzer, INDEX_ANALYZER)
    assert.equal(properties._search.search_analyzer, ANALYZER)
    // _search_boosted is intentionally not created; the per-field ^3/^2 boost is applied at query time
    assert.equal(properties._search_boosted, undefined)
    assert.equal(properties.f0.copy_to, '_search')
    // boost-eligible columns are queried per-field with their boost suffix; no point copying them into _search
    assert.equal(properties.label_col.copy_to, undefined)
    // a boolean column has no text inner field -> not copied
    assert.equal(properties.a_bool.copy_to, undefined)
  })
})

// `indexDefinition(dataset)` (manage-indices) emits with `currentIndexShape(dataset)` by default,
// and `updateDatasetMapping` — the partial mapping update attempted on every schema patch — uses
// that default for both the new and the old definition. These cases pin the rule that keeps an
// index internally homogeneous (design §3): the shape follows the INDEX, never the code version.
test.describe('emission shape of a partial mapping update (updateDatasetMapping path)', () => {
  const legacyDataset: any = { id: 'legacy', schema: [stringField('a')], extensions: [] }

  test('legacy dataset (no _indexShape) gaining a column emits the new column legacy-shaped', () => {
    const patchedSchema = [...legacyDataset.schema, stringField('b')]
    const patchedDataset = { ...legacyDataset, schema: patchedSchema }
    // exactly indexDefinition's emission call for the NEW definition of a mapping update
    const { properties } = buildIndexMappings(patchedDataset, patchedSchema, ANALYZERS, currentIndexShape(patchedDataset))
    // the freshly added column must look like every other column of that legacy index
    assert.equal(properties.b.fields.text_standard.analyzer, 'standard')
    assert.equal(properties.b.fields.text.analyzer, ANALYZER)
    assert.equal(properties.b.fields.text.search_analyzer, undefined)
    // ... and identical to the pre-existing one
    assert.deepEqual(properties.b.fields, properties.a.fields)
    // a mapping update never stamps: the index is still legacy
    assert.equal(patchedDataset._indexShape, undefined)
    assert.equal(legacyDataset._indexShape, undefined)
  })

  test('new-shape dataset gaining a column emits the new column new-shaped', () => {
    const schema = [stringField('a'), stringField('b')]
    const dataset: any = { id: 'new', schema, extensions: [], _indexShape: NEW_INDEX_SHAPE }
    const { properties } = buildIndexMappings(dataset, schema, ANALYZERS, currentIndexShape(dataset))
    assert.equal(properties.b.fields.text_standard, undefined)
    assert.equal(properties.b.fields.text.analyzer, INDEX_ANALYZER)
    assert.equal(properties.b.fields.text.search_analyzer, ANALYZER)
  })

  test('currentIndexShape: absent stamp is legacy, stamp is followed', () => {
    assert.deepEqual(currentIndexShape({}), LEGACY_INDEX_SHAPE)
    assert.deepEqual(currentIndexShape({ _indexShape: NEW_INDEX_SHAPE }), NEW_INDEX_SHAPE)
    assert.deepEqual(currentIndexShape({ _indexShape: { singleTextField: true } }), { singleTextField: true })
  })
})

test.describe('esProperty shapes', () => {
  test('new shape: single .text with search_analyzer, no .text_standard on strings', () => {
    const p = esProperty({ key: 'a', type: 'string' }, { search: 'S', index: 'I' })
    assert.equal(p.fields.text.analyzer, 'I')
    assert.equal(p.fields.text.search_analyzer, 'S')
    assert.equal(p.fields.text_standard, undefined)
  })
  test('new shape: textAgg column gets .words, fielddata moves there', () => {
    const p = esProperty({ key: 'a', type: 'string', 'x-capabilities': { textAgg: true } }, { search: 'S', index: 'I' })
    assert.deepEqual(p.fields.words, { type: 'text', analyzer: 'S', index_options: 'docs', norms: false, fielddata: true })
    assert.equal(p.fields.text.fielddata, undefined)
  })
  test('legacy shape emission is byte-identical to the historical dual shape', () => {
    const p = esProperty({ key: 'a', type: 'string' }, { search: 'S', index: 'I' }, LEGACY_INDEX_SHAPE)
    assert.equal(p.fields.text.analyzer, 'S')
    assert.equal(p.fields.text.search_analyzer, undefined)
    assert.equal(p.fields.text_standard.analyzer, 'standard')
    assert.equal(p.fields.keyword_insensitive.normalizer, 'insensitive_normalizer')
  })
  test('scalars keep .text_standard under both shapes', () => {
    for (const shape of [undefined, LEGACY_INDEX_SHAPE]) {
      const p = esProperty({ key: 'n', type: 'number' }, { search: 'S', index: 'I' }, shape)
      assert.equal(p.fields.text_standard.analyzer, 'standard')
    }
  })
  test('search disabled: no analyzed field at all under the new shape', () => {
    const p = esProperty({ key: 'a', type: 'string', 'x-capabilities': { text: false, textStandard: false } }, { search: 'S', index: 'I' })
    assert.equal(p.fields.text, undefined)
    assert.equal(p.fields.text_standard, undefined)
  })
  test('new shape, text disabled: the single field is the unstemmed .text_standard, under that name', () => {
    // `text: false` = language analysis explicitly refused, so the single analyzed field must be
    // the standard one — and it MUST keep the legacy name, otherwise the query layer (which
    // derives its lists from the legacy emission and unions the two names) drops the column
    // out of `q`/`qs` entirely on a new-shape index.
    const p = esProperty({ key: 'a', type: 'string', 'x-capabilities': { text: false } }, { search: 'S', index: 'I' })
    assert.equal(p.fields.text, undefined)
    assert.deepEqual(p.fields.text_standard, { type: 'text', analyzer: 'standard' })
    assert.equal(p.fields.text_standard.search_analyzer, undefined)
  })
  test('new shape, textStandard disabled: the single .text repeat field, unchanged', () => {
    const p = esProperty({ key: 'a', type: 'string', 'x-capabilities': { textStandard: false } }, { search: 'S', index: 'I' })
    assert.equal(p.fields.text.analyzer, 'I')
    assert.equal(p.fields.text.search_analyzer, 'S')
    assert.equal(p.fields.text_standard, undefined)
  })
})
