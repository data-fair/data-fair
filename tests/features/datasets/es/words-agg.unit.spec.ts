import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { buildWordsAggs } from '../../../../api/src/datasets/es/operations.ts'

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
