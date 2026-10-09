/**
 * calculate_metric declares `metric` as number | string | object and describes
 * percentiles as "an object mapping percentage strings to values". The API
 * returns an ARRAY: metric-agg.ts sets `keyed = false`, so Elasticsearch answers
 * with [{key, value}, …] and `values.map()` passes it straight through.
 *
 * JSON Schema treats array as its own type, so the call failed at the output
 * boundary with "Instance type \"array\" is invalid" and the model silently
 * routed around a metric it had been offered. Normalising here honours the
 * contract the tool already publishes, and leaves the API alone.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { formatResult } from '../../../agent-tools/calculate-metric.ts'

const params = { datasetId: 'd', fieldKey: 'capacite', metric: 'percentiles' as const }

test.describe('percentiles come back as the object the schema promises', () => {
  test('keys an array of {key, value} pairs by percentage', () => {
    const { structuredContent } = formatResult(
      { total: 40, metric: [{ key: 25, value: 520 }, { key: 50, value: 800 }, { key: 75, value: 1800 }] },
      params
    )
    assert.deepEqual(structuredContent.metric, { 25: 520, 50: 800, 75: 1800 })
  })

  test('renders them for a reader as well', () => {
    const { text } = formatResult({ total: 40, metric: [{ key: 50, value: 800 }] }, params)
    assert.ok(text.includes('p50: 800'), text)
  })

  test('leaves an already-keyed object alone', () => {
    // Defensive: keyed:true would give this shape, and it is what the tool
    // description has always claimed.
    const { structuredContent } = formatResult({ total: 40, metric: { 50: 800 } }, params)
    assert.deepEqual(structuredContent.metric, { 50: 800 })
  })

  test('survives a date column, where the values are formatted strings', () => {
    const { structuredContent } = formatResult(
      { total: 3, metric: [{ key: 50, value: '2026-09-17' }] },
      { ...params, fieldKey: 'date_ouverture' }
    )
    assert.deepEqual(structuredContent.metric, { 50: '2026-09-17' })
  })

  test('does not disturb the other metrics', () => {
    assert.equal(formatResult({ total: 40, metric: 12.5 }, { ...params, metric: 'avg' }).structuredContent.metric, 12.5)
    assert.deepEqual(
      formatResult({ total: 40, metric: { count: 40, min: 1, max: 9 } }, { ...params, metric: 'stats' }).structuredContent.metric,
      { count: 40, min: 1, max: 9 }
    )
  })
})
