import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { normalizeSort } from '../../../agent-tools/_utils.ts'
import * as getDatasetSchema from '../../../agent-tools/get-dataset-schema.ts'
import * as searchData from '../../../agent-tools/search-data.ts'
import * as aggregateData from '../../../agent-tools/aggregate-data.ts'
import * as calculateMetric from '../../../agent-tools/calculate-metric.ts'
import * as getFieldValues from '../../../agent-tools/get-field-values.ts'

// These tests target the shipping data tools in the @data-fair/agent-tools-data-fair
// package directly (its pure buildQuery / formatResult functions), the same code the
// UI composables wrap. They previously tested a stale duplicate in
// ui/src/composables/dataset/agent-data-tools-logic.ts, which has since been removed.

// --- normalizeSort ---

test.describe('normalizeSort', () => {
  test('passes through normal sort fields', () => {
    assert.equal(normalizeSort('name,-age'), 'name,-age')
  })

  test('strips bare _geo_distance', () => {
    assert.equal(normalizeSort('_geo_distance'), '')
  })

  test('strips bare -_geo_distance', () => {
    assert.equal(normalizeSort('-_geo_distance'), '')
  })

  test('keeps _geo_distance with coordinates', () => {
    assert.equal(normalizeSort('_geo_distance:2.35:48.85'), '_geo_distance:2.35:48.85')
  })

  test('strips bare _geo_distance from mixed sort', () => {
    assert.equal(normalizeSort('name,_geo_distance,-age'), 'name,-age')
  })

  test('handles empty string', () => {
    assert.equal(normalizeSort(''), '')
  })
})

// --- get_dataset_schema ---

test.describe('get_dataset_schema buildQuery', () => {
  test('selects schema, title and slug; requests 3 sample lines', () => {
    const { schemaReq, samplesReq } = getDatasetSchema.buildQuery({ datasetId: 'test-ds' })
    assert.equal(schemaReq.path, 'datasets/test-ds')
    assert.deepEqual(schemaReq.query.select.split(',').sort(), ['schema', 'slug', 'title'])
    assert.equal(samplesReq.path, 'datasets/test-ds/lines')
    assert.equal(samplesReq.query.size, '3')
  })

  test('encodes the dataset identifier in the path', () => {
    const { schemaReq } = getDatasetSchema.buildQuery({ datasetId: 'a b/c' })
    assert.equal(schemaReq.path, 'datasets/a%20b%2Fc')
  })
})

test.describe('get_dataset_schema formatResult', () => {
  test('filters internal fields and formats markdown', () => {
    const dataset = {
      title: 'Test Dataset',
      schema: [
        { key: '_id', type: 'string' },
        { key: '_i', type: 'integer' },
        { key: '_rand', type: 'number' },
        { key: 'name', type: 'string', title: 'Name' },
        { key: 'age', type: 'integer', title: 'Age' }
      ]
    }
    const linesData = { results: [{ _id: '1', _i: 0, _rand: 5, name: 'Alice', age: 30 }] }

    const result = getDatasetSchema.formatResult(dataset, linesData)
    assert.ok(result.includes('# Schema: Test Dataset'))
    assert.ok(result.includes('`name`'))
    assert.ok(result.includes('`age`'))
    assert.ok(!result.includes('`_id`'))
    assert.ok(!result.includes('`_i`'))
    assert.ok(!result.includes('`_rand`'))
    // Sample data should not include internal fields
    assert.ok(result.includes('name,age'))
    assert.ok(result.includes('Alice,30'))
  })

  test('includes enum notes', () => {
    const result = getDatasetSchema.formatResult(
      { title: 'DS1', schema: [{ key: 'status', type: 'string', title: 'Status', enum: ['a', 'b', 'c'] }] },
      { results: [] }
    )
    assert.ok(result.includes('enum: a, b, c'))
  })

  test('includes concept notes', () => {
    const result = getDatasetSchema.formatResult(
      { title: 'DS1', schema: [{ key: 'city', type: 'string', 'x-concept': { title: 'City Name' } }] },
      { results: [] }
    )
    assert.ok(result.includes('concept: City Name'))
  })
})

// --- search_data ---

test.describe('search_data buildQuery', () => {
  test('builds basic query with default size', () => {
    const { path, query } = searchData.buildQuery({ datasetId: 'ds1' })
    assert.equal(path, 'datasets/ds1/lines')
    assert.equal(query.size, '10')
  })

  test('clamps size to 50 max', () => {
    const { query } = searchData.buildQuery({ datasetId: 'ds1', size: 200 })
    assert.equal(query.size, '50')
  })

  test('applies full-text search with q_mode', () => {
    const { query } = searchData.buildQuery({ datasetId: 'ds1', q: 'hello' })
    assert.equal(query.q, 'hello')
    assert.equal(query.q_mode, 'complete')
  })

  test('normalizes sort and strips bare _geo_distance', () => {
    const { query } = searchData.buildQuery({ datasetId: 'ds1', sort: 'name,_geo_distance' })
    assert.equal(query.sort, 'name')
  })

  test('does not set sort when normalizeSort returns empty', () => {
    const { query } = searchData.buildQuery({ datasetId: 'ds1', sort: '_geo_distance' })
    assert.equal(query.sort, undefined)
  })

  test('applies filters as query params', () => {
    const { query } = searchData.buildQuery({ datasetId: 'ds1', filters: { status_eq: 'active', age_lte: '30' } })
    assert.equal(query.status_eq, 'active')
    assert.equal(query.age_lte, '30')
  })

  test('applies geo and date params', () => {
    const { query } = searchData.buildQuery({
      datasetId: 'ds1',
      bbox: '-2.5,43,3,47',
      geoDistance: '2.35,48.85,10km',
      dateMatch: '2024-01-01'
    })
    assert.equal(query.bbox, '-2.5,43,3,47')
    assert.equal(query.geo_distance, '2.35,48.85,10km')
    assert.equal(query.date_match, '2024-01-01')
  })
})

test.describe('search_data formatResult', () => {
  test('formats output with total and CSV, dropping internal fields', () => {
    const data = { total: 100, results: [{ _id: '1', _i: 0, _rand: 5, name: 'Alice' }] }
    const { text, structuredContent } = searchData.formatResult(data, { datasetId: 'ds1' })
    assert.ok(text.includes('**100** rows found'))
    assert.ok(text.includes('name\nAlice'))
    assert.equal(structuredContent.total, 100)
    assert.deepEqual(structuredContent.results, [{ name: 'Alice' }])
  })

  test('indicates next page when available', () => {
    const data = { total: 100, results: [{ name: 'Alice' }], next: 'http://example.com/next' }
    const { text, structuredContent } = searchData.formatResult(data, { datasetId: 'ds1' })
    assert.ok(text.includes('Next page available.'))
    assert.equal(structuredContent.next, 'http://example.com/next')
  })

  test('appends the filter query string when filters are present', () => {
    const data = { total: 1, results: [{ name: 'Alice' }] }
    const { text } = searchData.formatResult(data, { datasetId: 'ds1', filters: { status_eq: 'active' } })
    assert.ok(text.includes('Filter query: status_eq=active'))
  })
})

// --- aggregate_data ---

test.describe('aggregate_data buildQuery', () => {
  test('builds correct field param for simple group-by', () => {
    const { path, query } = aggregateData.buildQuery({ datasetId: 'ds1', groupByColumns: ['status'] })
    assert.equal(path, 'datasets/ds1/values_agg')
    assert.equal(query.field, 'status')
  })

  test('joins multiple group-by columns with semicolon', () => {
    const { query } = aggregateData.buildQuery({ datasetId: 'ds1', groupByColumns: ['city', 'status'] })
    assert.equal(query.field, 'city;status')
  })

  test('includes metric params when not count', () => {
    const { query } = aggregateData.buildQuery({
      datasetId: 'ds1',
      groupByColumns: ['city'],
      metric: { type: 'sum', column: 'amount' }
    })
    assert.equal(query.metric, 'sum')
    assert.equal(query.metric_field, 'amount')
  })

  test('skips metric params when type is count', () => {
    const { query } = aggregateData.buildQuery({
      datasetId: 'ds1',
      groupByColumns: ['city'],
      metric: { type: 'count' }
    })
    assert.equal(query.metric, undefined)
    assert.equal(query.metric_field, undefined)
  })
})

test.describe('aggregate_data formatResult', () => {
  test('formats flat aggregation results', () => {
    const data = {
      total: 100,
      total_values: 2,
      total_other: 10,
      aggs: [
        { value: 'Paris', total: 60 },
        { value: 'Lyon', total: 30 }
      ]
    }
    const { text } = aggregateData.formatResult(data, { datasetId: 'ds1', groupByColumns: ['city'] })
    assert.ok(text.includes('**100** total rows'))
    assert.ok(text.includes('**Paris**: 60 rows'))
    assert.ok(text.includes('**Lyon**: 30 rows'))
  })

  test('formats nested aggregation results', () => {
    const data = {
      total: 100,
      total_values: 1,
      total_other: 0,
      aggs: [
        { value: 'Paris', total: 60, aggs: [{ value: 'active', total: 40 }, { value: 'inactive', total: 20 }] }
      ]
    }
    const { text } = aggregateData.formatResult(data, { datasetId: 'ds1', groupByColumns: ['city', 'status'] })
    assert.ok(text.includes('**Paris**: 60 rows'))
    assert.ok(text.includes('**active**: 40 rows'))
  })

  test('includes metric value in output', () => {
    const data = { total: 100, total_values: 1, total_other: 0, aggs: [{ value: 'Paris', total: 60, metric: 1500.5 }] }
    const { text } = aggregateData.formatResult(data, {
      datasetId: 'ds1',
      groupByColumns: ['city'],
      metric: { type: 'sum', column: 'amount' }
    })
    assert.ok(text.includes('sum(amount) = 1500.5'))
  })
})

// --- calculate_metric ---

test.describe('calculate_metric buildQuery', () => {
  test('builds metric and field params', () => {
    const { path, query } = calculateMetric.buildQuery({ datasetId: 'ds1', fieldKey: 'age', metric: 'avg' })
    assert.equal(path, 'datasets/ds1/metric_agg')
    assert.equal(query.metric, 'avg')
    assert.equal(query.field, 'age')
  })

  test('passes filters and geo/date params', () => {
    const { query } = calculateMetric.buildQuery({
      datasetId: 'ds1',
      fieldKey: 'age',
      metric: 'avg',
      filters: { status_eq: 'active' },
      bbox: '1,2,3,4',
      dateMatch: '2024-01-01'
    })
    assert.equal(query.status_eq, 'active')
    assert.equal(query.bbox, '1,2,3,4')
    assert.equal(query.date_match, '2024-01-01')
  })
})

test.describe('calculate_metric formatResult', () => {
  test('formats scalar metric result', () => {
    const { text } = calculateMetric.formatResult({ total: 100, metric: 42.5 }, { datasetId: 'ds1', fieldKey: 'age', metric: 'avg' })
    assert.ok(text.includes('**avg** of `age`'))
    assert.ok(text.includes('Total rows: 100'))
    assert.ok(text.includes('**42.5**'))
  })

  test('formats stats object metric result', () => {
    const { text } = calculateMetric.formatResult(
      { total: 100, metric: { min: 10, max: 90, avg: 50, sum: 5000, count: 100 } },
      { datasetId: 'ds1', fieldKey: 'age', metric: 'stats' }
    )
    assert.ok(text.includes('min: 10'))
    assert.ok(text.includes('max: 90'))
    assert.ok(text.includes('avg: 50'))
  })

  test('formats percentiles object with p prefix', () => {
    const { text } = calculateMetric.formatResult(
      { total: 100, metric: { 25: 20, 50: 45, 75: 70 } },
      { datasetId: 'ds1', fieldKey: 'age', metric: 'percentiles' }
    )
    assert.ok(text.includes('p25: 20'))
    assert.ok(text.includes('p50: 45'))
    assert.ok(text.includes('p75: 70'))
  })
})

// --- get_field_values ---

test.describe('get_field_values buildQuery', () => {
  test('clamps size to 1000 max', () => {
    const { query } = getFieldValues.buildQuery({ datasetId: 'ds1', fieldKey: 'col', size: 5000 })
    assert.equal(query.size, '1000')
  })

  test('clamps size to 1 min', () => {
    const { query } = getFieldValues.buildQuery({ datasetId: 'ds1', fieldKey: 'col', size: -10 })
    assert.equal(query.size, '1')
  })

  test('builds the values path with encoded field key', () => {
    const { path } = getFieldValues.buildQuery({ datasetId: 'ds1', fieldKey: 'a b' })
    assert.equal(path, 'datasets/ds1/values/a%20b')
  })
})

test.describe('get_field_values formatResult', () => {
  test('formats values as markdown list', () => {
    const { text } = getFieldValues.formatResult(['active', 'inactive', 'pending'], { datasetId: 'ds1', fieldKey: 'status' })
    assert.ok(text.includes('Distinct values of `status`:'))
    assert.ok(text.includes('- active'))
    assert.ok(text.includes('- inactive'))
    assert.ok(text.includes('- pending'))
  })
})
