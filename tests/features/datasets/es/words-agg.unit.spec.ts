import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { buildWordsAggs, resolveWordsAggField } from '../../../../api/src/datasets/es/operations.ts'

test.describe('buildWordsAggs', () => {
  test('uses a terms aggregation when there is no text query', () => {
    const aggs = buildWordsAggs('terms', 'field.text', 20)
    assert.ok(aggs.sample.aggregations.words.terms)
    assert.equal(aggs.sample.aggregations.words.terms.field, 'field.text')
    assert.equal(aggs.sample.aggregations.words.terms.size, 20)
  })

  test('uses a significant_text aggregation that de-duplicates near-identical text when a text query is present', () => {
    const aggs = buildWordsAggs('significant_text', 'field.text', 20)
    assert.ok(aggs.sample.aggregations.words.significant_text)
    assert.equal(aggs.sample.aggregations.words.significant_text.field, 'field.text')
    assert.equal(aggs.sample.aggregations.words.significant_text.size, 20)
    // significant_text is costly and dominated by near-duplicate documents unless we
    // de-duplicate; this guard never fired because of a typo in the agg-type comparison
    assert.equal(aggs.sample.aggregations.words.significant_text.filter_duplicate_text, true)
  })
})

test.describe('resolveWordsAggField', () => {
  test('legacy dataset (no _indexShape) defaults to .text', () => {
    const dataset = { isVirtual: false }
    assert.equal(resolveWordsAggField(dataset, { field: 'adr' }), 'adr.text')
  })

  test('legacy dataset honors analysis=standard', () => {
    const dataset = { isVirtual: false }
    assert.equal(resolveWordsAggField(dataset, { field: 'adr', analysis: 'standard' }), 'adr.text_standard')
  })

  test('new-shape dataset routes to .words', () => {
    const dataset = { isVirtual: false, _indexShape: { wordAggField: true } }
    assert.equal(resolveWordsAggField(dataset, { field: 'adr' }), 'adr.words')
  })

  test('new-shape dataset rejects analysis=standard with a 400', () => {
    const dataset = { isVirtual: false, _indexShape: { wordAggField: true } }
    assert.throws(() => resolveWordsAggField(dataset, { field: 'adr', analysis: 'standard' }), { status: 400 })
  })

  test('virtual dataset with only legacy descendants defaults to .text', () => {
    const dataset = {
      isVirtual: true,
      descendants: [{ id: 'd1', index: 'i1', _indexShape: {} }, { id: 'd2', index: 'i2' }]
    }
    assert.equal(resolveWordsAggField(dataset, { field: 'adr' }), 'adr.text')
  })

  test('virtual dataset with only new-shape descendants routes to .words', () => {
    const dataset = {
      isVirtual: true,
      descendants: [
        { id: 'd1', index: 'i1', _indexShape: { wordAggField: true } },
        { id: 'd2', index: 'i2', _indexShape: { wordAggField: true } }
      ]
    }
    assert.equal(resolveWordsAggField(dataset, { field: 'adr' }), 'adr.words')
  })

  test('virtual dataset with mixed-shape descendants is refused with a clear 400', () => {
    const dataset = {
      isVirtual: true,
      descendants: [
        { id: 'd1', index: 'i1', _indexShape: { wordAggField: true } },
        { id: 'd2', index: 'i2', _indexShape: {} }
      ]
    }
    assert.throws(() => resolveWordsAggField(dataset, { field: 'adr' }), (err: any) => {
      assert.equal(err.status, 400)
      assert.ok(err.message.includes('ré-indexés'))
      return true
    })
  })
})
