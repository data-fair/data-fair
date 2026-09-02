import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { assertMetricAccepted, isMetricAggregatable, getSimpleMetricsFields } from '../../../../api/src/datasets/es/operations.ts'

const geomUri = 'https://purl.org/geojson/vocab#geometry'

const num = { key: 'n', type: 'number' }
const str = { key: 's', type: 'string' }
const date = { key: 'd', type: 'string', format: 'date' }
const bool = { key: 'b', type: 'boolean' }
const obj = { key: 'o', type: 'object' }
const geomStr = { key: 'geom', type: 'string', 'x-refersTo': geomUri }
const noValues = { key: 'nv', type: 'string', 'x-capabilities': { values: false } }
const calc = { key: '_i', type: 'integer', 'x-calculated': true }
const geopoint = { key: '_geopoint', type: 'string', 'x-calculated': true }

const dataset = { schema: [num, str, date, bool, obj, geomStr, noValues, calc, geopoint] }

test.describe('metric aggregatability of columns', () => {
  test('scalar columns with doc_values are aggregatable', () => {
    assert.equal(isMetricAggregatable(num), true)
    assert.equal(isMetricAggregatable(str), true)
    assert.equal(isMetricAggregatable(date), true)
    assert.equal(isMetricAggregatable(bool), true)
    assert.equal(isMetricAggregatable(calc), true)
  })

  test('columns whose ES mapping cannot serve metric aggs are excluded', () => {
    // geometry-refersTo string columns are mapped {type: keyword, index: false, doc_values: false}
    assert.equal(isMetricAggregatable(geomStr), false)
    // geometry-refersTo object columns are mapped {enabled: false}
    assert.equal(isMetricAggregatable({ key: 'geomObj', type: 'object', 'x-refersTo': geomUri }), false)
    // object columns have no doc-values leaf field
    assert.equal(isMetricAggregatable(obj), false)
    // geo calculated columns are mapped geo_point / geo_shape
    assert.equal(isMetricAggregatable(geopoint), false)
    assert.equal(isMetricAggregatable({ key: '_geoshape', type: 'object', 'x-calculated': true }), false)
    // values capability disabled → doc_values: false
    assert.equal(isMetricAggregatable(noValues), false)
    // _id has no mapping of its own
    assert.equal(isMetricAggregatable({ key: '_id', type: 'string', format: 'uri-reference', 'x-calculated': true }), false)
  })
})

test.describe('simple_metrics_agg effective fields list', () => {
  test('default list keeps only aggregatable, non-calculated columns', () => {
    assert.deepEqual(getSimpleMetricsFields(dataset, {}), ['n', 's', 'd', 'b'])
  })

  test('default list narrows to the columns accepting the requested metrics', () => {
    // boolean columns accept the same metric aggs as numeric ones (doc-valued as 0/1)
    assert.deepEqual(getSimpleMetricsFields(dataset, { metrics: 'avg' }), ['n', 'd', 'b'])
    assert.deepEqual(getSimpleMetricsFields(dataset, { metrics: 'cardinality' }), ['n', 's', 'd', 'b'])
    assert.deepEqual(getSimpleMetricsFields(dataset, { metrics: 'min,max' }), ['n', 's', 'd', 'b'])
  })

  test('explicit fields are returned as requested', () => {
    assert.deepEqual(getSimpleMetricsFields(dataset, { fields: 's,n' }), ['s', 'n'])
  })

  test('explicit unknown field → 400', () => {
    assert.throws(() => getSimpleMetricsFields(dataset, { fields: 'nope' }), (e: any) => e.status === 400)
  })

  test('explicit geometry field → 400 (never reaches ES)', () => {
    assert.throws(() => getSimpleMetricsFields(dataset, { fields: 'geom' }), (e: any) => e.status === 400)
  })

  test('explicit field with values capability disabled → 400', () => {
    assert.throws(() => getSimpleMetricsFields(dataset, { fields: 'nv' }), (e: any) => e.status === 400)
  })

  test('unknown metric name → 400, with or without explicit fields', () => {
    assert.throws(() => getSimpleMetricsFields(dataset, { metrics: 'nope' }), (e: any) => e.status === 400)
    assert.throws(() => getSimpleMetricsFields(dataset, { fields: 'n', metrics: 'nope' }), (e: any) => e.status === 400)
  })

  test('explicit field incompatible with the requested metric → 400', () => {
    assert.throws(() => getSimpleMetricsFields(dataset, { fields: 's', metrics: 'avg' }), (e: any) => e.status === 400)
  })
})

test.describe('boolean columns accept numeric-like metric aggs', () => {
  test('sum/avg/min/max/stats/percentiles are accepted on boolean', () => {
    for (const metric of ['avg', 'sum', 'min', 'max', 'stats', 'percentiles', 'value_count', 'cardinality']) {
      assert.doesNotThrow(() => assertMetricAccepted(bool, metric), `metric ${metric} should be accepted on boolean`)
    }
  })

  test('non-aggregatable columns (object) reject every metric, even value_count', () => {
    // string columns accept value_count, objects fail isMetricAggregatable before the metric list is even consulted
    assert.doesNotThrow(() => assertMetricAccepted(str, 'value_count'))
    assert.throws(() => assertMetricAccepted(obj, 'value_count'), (e: any) => e.status === 400)
    assert.throws(() => assertMetricAccepted(obj, 'sum'), (e: any) => e.status === 400)
  })
})
