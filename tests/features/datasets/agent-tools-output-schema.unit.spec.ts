import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { Ajv } from 'ajv'
import * as calculateMetric from '../../../agent-tools/calculate-metric.ts'
import * as describeDataset from '../../../agent-tools/describe-dataset.ts'
import * as searchData from '../../../agent-tools/search-data.ts'

// The agent tools declare an `outputSchema` and return a `structuredContent`.
// The MCP SDK strictly validates the latter against the former (ajv). When they
// disagree the tool call fails with "Output validation error: Invalid structured
// content ... Instance type X is invalid. Expected Y." and the assistant loses
// access to the tool. These tests pin structuredContent to its declared schema
// using real-world data shapes returned by the data-fair API.

const ajv = new Ajv({ strict: false, allErrors: true })

const validate = (outputSchema: any, structuredContent: any) => {
  const fn = ajv.compile(outputSchema)
  const ok = fn(structuredContent)
  return { ok, errors: ajv.errorsText(fn.errors) }
}

test.describe('calculate_metric output schema', () => {
  // sum/avg/min/max/value_count/cardinality return a single number
  test('numeric metric (sum) matches outputSchema', () => {
    const { structuredContent } = calculateMetric.formatResult(
      { total: 16, metric: 4721525 },
      { datasetId: 'd1', fieldKey: 'energieannuelleglissanteinjectee', metric: 'sum' }
    )
    const { ok, errors } = validate(calculateMetric.schema.outputSchema, structuredContent)
    assert.ok(ok, errors)
  })

  // min/max on a string column return a string
  test('string metric (max on string column) matches outputSchema', () => {
    const { structuredContent } = calculateMetric.formatResult(
      { total: 16, metric: 'Solaire' },
      { datasetId: 'd1', fieldKey: 'filiere', metric: 'max' }
    )
    const { ok, errors } = validate(calculateMetric.schema.outputSchema, structuredContent)
    assert.ok(ok, errors)
  })

  // stats/percentiles return an object — must still validate
  test('object metric (stats) matches outputSchema', () => {
    const { structuredContent } = calculateMetric.formatResult(
      { total: 16, metric: { count: 16, min: 0, max: 4721525, avg: 1000, sum: 6000000 } },
      { datasetId: 'd1', fieldKey: 'puismaxinstallee', metric: 'stats' }
    )
    const { ok, errors } = validate(calculateMetric.schema.outputSchema, structuredContent)
    assert.ok(ok, errors)
  })
})

test.describe('describe_dataset output schema', () => {
  // data-fair models `spatial` as a free-text string (api/types/dataset spatial?: string)
  test('dataset with string spatial coverage matches outputSchema', () => {
    const { structuredContent } = describeDataset.formatResult({
      id: 'd1',
      title: 'Agrégats de production électrique',
      page: 'https://opendata.enedis.fr/datasets/prod',
      count: 5679072,
      spatial: 'France métropolitaine',
      temporal: { start: '2020-01-01', end: '2024-12-31' },
      license: { title: 'Licence Ouverte', href: 'https://example.org/licence' }
    })
    const { ok, errors } = validate(describeDataset.schema.outputSchema, structuredContent)
    assert.ok(ok, errors)
  })
})

test.describe('search_data output schema (regression guard)', () => {
  test('result rows match outputSchema', () => {
    const { structuredContent } = searchData.formatResult(
      { total: 16, results: [{ commune: 'Nanterre', filiere: 'Solaire' }] },
      { datasetId: 'd1' }
    )
    const { ok, errors } = validate(searchData.schema.outputSchema, structuredContent)
    assert.ok(ok, errors)
  })
})

test.describe('search_data pagination cursor', () => {
  // The harness forwards only the tool text to the model, not structuredContent. The next
  // cursor must therefore appear verbatim in the text, otherwise the model fabricates a URL.
  test('text includes the next URL when another page exists', () => {
    const nextUrl = 'https://opendata.enedis.fr/api/v1/datasets/d1/lines?page=2&after=xyz'
    const { text, structuredContent } = searchData.formatResult(
      { total: 16, results: [{ commune: 'Nanterre' }], next: nextUrl },
      { datasetId: 'd1' }
    )
    assert.ok(text.includes(nextUrl), 'next URL must be present in the text sent to the model')
    assert.equal(structuredContent.next, nextUrl)
  })

  test('no next URL when on the last page', () => {
    const { text } = searchData.formatResult(
      { total: 5, results: [{ commune: 'Nanterre' }] },
      { datasetId: 'd1' }
    )
    assert.ok(!text.includes('Next page available'), text)
  })
})
