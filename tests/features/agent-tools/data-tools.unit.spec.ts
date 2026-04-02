import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  normalizeSort,
  applyGeoParams,
  applyDateMatchParam,
  executeGetDatasetSchema,
  executeSearchData,
  executeAggregateData,
  executeCalculateMetric,
  executeGetFieldValues
} from '../../../ui/src/composables/dataset/agent-data-tools-logic.ts'

// --- Helper: mock $fetch ---

function mockFetch (responses: Record<string, any>) {
  return (async (url: string, opts?: any) => {
    // Find matching response by URL prefix
    for (const [key, value] of Object.entries(responses)) {
      if (url.includes(key)) {
        if (typeof value === 'function') return value(url, opts)
        return value
      }
    }
    throw new Error(`Unexpected fetch: ${url}`)
  }) as any
}

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

// --- applyGeoParams ---

test.describe('applyGeoParams', () => {
  test('adds bbox when provided', () => {
    const query: Record<string, string> = {}
    applyGeoParams(query, '-2.5,43,3,47', undefined)
    assert.equal(query.bbox, '-2.5,43,3,47')
    assert.equal(query.geo_distance, undefined)
  })

  test('adds geo_distance when provided', () => {
    const query: Record<string, string> = {}
    applyGeoParams(query, undefined, '2.35,48.85,10km')
    assert.equal(query.geo_distance, '2.35,48.85,10km')
    assert.equal(query.bbox, undefined)
  })

  test('does nothing when both undefined', () => {
    const query: Record<string, string> = {}
    applyGeoParams(query, undefined, undefined)
    assert.deepEqual(query, {})
  })
})

// --- applyDateMatchParam ---

test.describe('applyDateMatchParam', () => {
  test('adds date_match when provided', () => {
    const query: Record<string, string> = {}
    applyDateMatchParam(query, '2024-01-01')
    assert.equal(query.date_match, '2024-01-01')
  })

  test('does nothing when undefined', () => {
    const query: Record<string, string> = {}
    applyDateMatchParam(query, undefined)
    assert.deepEqual(query, {})
  })
})

// --- executeGetDatasetSchema ---

test.describe('executeGetDatasetSchema', () => {
  test('filters internal fields and formats markdown', async () => {
    const fetchFn = mockFetch({
      'datasets/test-ds': (url: string) => {
        if (url.includes('/lines')) {
          return { results: [{ _id: '1', _i: 0, _rand: 5, name: 'Alice', age: 30 }] }
        }
        return {
          title: 'Test Dataset',
          schema: [
            { key: '_id', type: 'string' },
            { key: '_i', type: 'integer' },
            { key: '_rand', type: 'number' },
            { key: 'name', type: 'string', title: 'Name' },
            { key: 'age', type: 'integer', title: 'Age' }
          ]
        }
      }
    })

    const result = await executeGetDatasetSchema({ datasetId: 'test-ds' }, fetchFn)
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

  test('includes enum notes (truncated at 20)', async () => {
    const fetchFn = mockFetch({
      'datasets/ds1': (url: string) => {
        if (url.includes('/lines')) return { results: [] }
        return {
          title: 'DS1',
          schema: [
            { key: 'status', type: 'string', title: 'Status', enum: ['a', 'b', 'c'] }
          ]
        }
      }
    })

    const result = await executeGetDatasetSchema({ datasetId: 'ds1' }, fetchFn)
    assert.ok(result.includes('enum: a, b, c'))
  })

  test('includes concept notes', async () => {
    const fetchFn = mockFetch({
      'datasets/ds1': (url: string) => {
        if (url.includes('/lines')) return { results: [] }
        return {
          title: 'DS1',
          schema: [
            { key: 'city', type: 'string', 'x-concept': { title: 'City Name' } }
          ]
        }
      }
    })

    const result = await executeGetDatasetSchema({ datasetId: 'ds1' }, fetchFn)
    assert.ok(result.includes('concept: City Name'))
  })
})

// --- executeSearchData ---

test.describe('executeSearchData', () => {
  test('builds basic query with defaults', async () => {
    let capturedQuery: any
    const fetchFn = mockFetch({
      'datasets/ds1/lines': (_url: string, opts: any) => {
        capturedQuery = opts.query
        return { total: 1, results: [{ name: 'Alice' }] }
      }
    })

    await executeSearchData({ datasetId: 'ds1' }, fetchFn)
    assert.equal(capturedQuery.size, '10')
  })

  test('clamps size to 50 max', async () => {
    let capturedQuery: any
    const fetchFn = mockFetch({
      'datasets/ds1/lines': (_url: string, opts: any) => {
        capturedQuery = opts.query
        return { total: 0, results: [] }
      }
    })

    await executeSearchData({ datasetId: 'ds1', size: 200 }, fetchFn)
    assert.equal(capturedQuery.size, '50')
  })

  test('applies full-text search with q_mode', async () => {
    let capturedQuery: any
    const fetchFn = mockFetch({
      'datasets/ds1/lines': (_url: string, opts: any) => {
        capturedQuery = opts.query
        return { total: 0, results: [] }
      }
    })

    await executeSearchData({ datasetId: 'ds1', q: 'hello' }, fetchFn)
    assert.equal(capturedQuery.q, 'hello')
    assert.equal(capturedQuery.q_mode, 'complete')
  })

  test('normalizes sort and strips bare _geo_distance', async () => {
    let capturedQuery: any
    const fetchFn = mockFetch({
      'datasets/ds1/lines': (_url: string, opts: any) => {
        capturedQuery = opts.query
        return { total: 0, results: [] }
      }
    })

    await executeSearchData({ datasetId: 'ds1', sort: 'name,_geo_distance' }, fetchFn)
    assert.equal(capturedQuery.sort, 'name')
  })

  test('does not set sort when normalizeSort returns empty', async () => {
    let capturedQuery: any
    const fetchFn = mockFetch({
      'datasets/ds1/lines': (_url: string, opts: any) => {
        capturedQuery = opts.query
        return { total: 0, results: [] }
      }
    })

    await executeSearchData({ datasetId: 'ds1', sort: '_geo_distance' }, fetchFn)
    assert.equal(capturedQuery.sort, undefined)
  })

  test('applies filters as query params', async () => {
    let capturedQuery: any
    const fetchFn = mockFetch({
      'datasets/ds1/lines': (_url: string, opts: any) => {
        capturedQuery = opts.query
        return { total: 0, results: [] }
      }
    })

    await executeSearchData({ datasetId: 'ds1', filters: { status_eq: 'active', age_lte: '30' } }, fetchFn)
    assert.equal(capturedQuery.status_eq, 'active')
    assert.equal(capturedQuery.age_lte, '30')
  })

  test('applies geo and date params', async () => {
    let capturedQuery: any
    const fetchFn = mockFetch({
      'datasets/ds1/lines': (_url: string, opts: any) => {
        capturedQuery = opts.query
        return { total: 0, results: [] }
      }
    })

    await executeSearchData({
      datasetId: 'ds1',
      bbox: '-2.5,43,3,47',
      geoDistance: '2.35,48.85,10km',
      dateMatch: '2024-01-01'
    }, fetchFn)
    assert.equal(capturedQuery.bbox, '-2.5,43,3,47')
    assert.equal(capturedQuery.geo_distance, '2.35,48.85,10km')
    assert.equal(capturedQuery.date_match, '2024-01-01')
  })

  test('uses next URL directly when provided', async () => {
    let fetchedUrl: string = ''
    const fetchFn = mockFetch({
      'next-page-url': (url: string) => {
        fetchedUrl = url
        return { total: 10, results: [{ name: 'Bob' }] }
      }
    })

    const result = await executeSearchData({ datasetId: 'ds1', next: 'next-page-url?page=2' }, fetchFn)
    assert.ok(fetchedUrl.includes('next-page-url'))
    assert.ok(result.includes('Bob'))
  })

  test('formats output with total and CSV', async () => {
    const fetchFn = mockFetch({
      'datasets/ds1/lines': () => ({
        total: 100,
        results: [{ _id: '1', _i: 0, _rand: 5, name: 'Alice' }]
      })
    })

    const result = await executeSearchData({ datasetId: 'ds1' }, fetchFn)
    assert.ok(result.includes('**100** rows found'))
    assert.ok(result.includes('name\nAlice'))
  })

  test('indicates next page when available', async () => {
    const fetchFn = mockFetch({
      'datasets/ds1/lines': () => ({
        total: 100,
        results: [{ name: 'Alice' }],
        next: 'http://example.com/next'
      })
    })

    const result = await executeSearchData({ datasetId: 'ds1' }, fetchFn)
    assert.ok(result.includes('Next page available.'))
  })
})

// --- executeAggregateData ---

test.describe('executeAggregateData', () => {
  test('builds correct query for simple group-by', async () => {
    let capturedQuery: any
    const fetchFn = mockFetch({
      'datasets/ds1/values_agg': (_url: string, opts: any) => {
        capturedQuery = opts.query
        return { total: 10, total_values: 3, total_other: 0, aggs: [] }
      }
    })

    await executeAggregateData({ datasetId: 'ds1', groupByColumns: ['status'] }, fetchFn)
    assert.equal(capturedQuery.field, 'status')
  })

  test('joins multiple group-by columns with semicolon', async () => {
    let capturedQuery: any
    const fetchFn = mockFetch({
      'datasets/ds1/values_agg': (_url: string, opts: any) => {
        capturedQuery = opts.query
        return { total: 10, total_values: 3, total_other: 0, aggs: [] }
      }
    })

    await executeAggregateData({ datasetId: 'ds1', groupByColumns: ['city', 'status'] }, fetchFn)
    assert.equal(capturedQuery.field, 'city;status')
  })

  test('includes metric params when not count', async () => {
    let capturedQuery: any
    const fetchFn = mockFetch({
      'datasets/ds1/values_agg': (_url: string, opts: any) => {
        capturedQuery = opts.query
        return { total: 10, total_values: 2, total_other: 0, aggs: [] }
      }
    })

    await executeAggregateData({
      datasetId: 'ds1',
      groupByColumns: ['city'],
      metric: { type: 'sum', column: 'amount' }
    }, fetchFn)
    assert.equal(capturedQuery.metric, 'sum')
    assert.equal(capturedQuery.metric_field, 'amount')
  })

  test('skips metric params when type is count', async () => {
    let capturedQuery: any
    const fetchFn = mockFetch({
      'datasets/ds1/values_agg': (_url: string, opts: any) => {
        capturedQuery = opts.query
        return { total: 10, total_values: 2, total_other: 0, aggs: [] }
      }
    })

    await executeAggregateData({
      datasetId: 'ds1',
      groupByColumns: ['city'],
      metric: { type: 'count' }
    }, fetchFn)
    assert.equal(capturedQuery.metric, undefined)
    assert.equal(capturedQuery.metric_field, undefined)
  })

  test('formats flat aggregation results', async () => {
    const fetchFn = mockFetch({
      'datasets/ds1/values_agg': () => ({
        total: 100,
        total_values: 2,
        total_other: 10,
        aggs: [
          { value: 'Paris', total: 60 },
          { value: 'Lyon', total: 30 }
        ]
      })
    })

    const result = await executeAggregateData({ datasetId: 'ds1', groupByColumns: ['city'] }, fetchFn)
    assert.ok(result.includes('**100** total rows'))
    assert.ok(result.includes('**Paris**: 60 rows'))
    assert.ok(result.includes('**Lyon**: 30 rows'))
  })

  test('formats nested aggregation results', async () => {
    const fetchFn = mockFetch({
      'datasets/ds1/values_agg': () => ({
        total: 100,
        total_values: 1,
        total_other: 0,
        aggs: [
          {
            value: 'Paris',
            total: 60,
            aggs: [
              { value: 'active', total: 40 },
              { value: 'inactive', total: 20 }
            ]
          }
        ]
      })
    })

    const result = await executeAggregateData({ datasetId: 'ds1', groupByColumns: ['city', 'status'] }, fetchFn)
    assert.ok(result.includes('**Paris**: 60 rows'))
    assert.ok(result.includes('**active**: 40 rows'))
  })

  test('includes metric value in output', async () => {
    const fetchFn = mockFetch({
      'datasets/ds1/values_agg': () => ({
        total: 100,
        total_values: 1,
        total_other: 0,
        aggs: [{ value: 'Paris', total: 60, metric: 1500.5 }]
      })
    })

    const result = await executeAggregateData({
      datasetId: 'ds1',
      groupByColumns: ['city'],
      metric: { type: 'sum', column: 'amount' }
    }, fetchFn)
    assert.ok(result.includes('sum(amount) = 1500.5'))
  })
})

// --- executeCalculateMetric ---

test.describe('executeCalculateMetric', () => {
  test('formats scalar metric result', async () => {
    const fetchFn = mockFetch({
      'datasets/ds1/metric_agg': () => ({ total: 100, metric: 42.5 })
    })

    const result = await executeCalculateMetric({
      datasetId: 'ds1', fieldKey: 'age', metric: 'avg'
    }, fetchFn)
    assert.ok(result.includes('**avg** of `age`'))
    assert.ok(result.includes('Total rows: 100'))
    assert.ok(result.includes('**42.5**'))
  })

  test('formats stats object metric result', async () => {
    const fetchFn = mockFetch({
      'datasets/ds1/metric_agg': () => ({
        total: 100,
        metric: { min: 10, max: 90, avg: 50, sum: 5000, count: 100 }
      })
    })

    const result = await executeCalculateMetric({
      datasetId: 'ds1', fieldKey: 'age', metric: 'stats'
    }, fetchFn)
    assert.ok(result.includes('min: 10'))
    assert.ok(result.includes('max: 90'))
    assert.ok(result.includes('avg: 50'))
  })

  test('formats percentiles object with p prefix', async () => {
    const fetchFn = mockFetch({
      'datasets/ds1/metric_agg': () => ({
        total: 100,
        metric: { 25: 20, 50: 45, 75: 70 }
      })
    })

    const result = await executeCalculateMetric({
      datasetId: 'ds1', fieldKey: 'age', metric: 'percentiles'
    }, fetchFn)
    assert.ok(result.includes('p25: 20'))
    assert.ok(result.includes('p50: 45'))
    assert.ok(result.includes('p75: 70'))
  })

  test('passes filters and geo/date params', async () => {
    let capturedQuery: any
    const fetchFn = mockFetch({
      'datasets/ds1/metric_agg': (_url: string, opts: any) => {
        capturedQuery = opts.query
        return { total: 50, metric: 30 }
      }
    })

    await executeCalculateMetric({
      datasetId: 'ds1',
      fieldKey: 'age',
      metric: 'avg',
      filters: { status_eq: 'active' },
      bbox: '1,2,3,4',
      dateMatch: '2024-01-01'
    }, fetchFn)
    assert.equal(capturedQuery.status_eq, 'active')
    assert.equal(capturedQuery.bbox, '1,2,3,4')
    assert.equal(capturedQuery.date_match, '2024-01-01')
  })
})

// --- executeGetFieldValues ---

test.describe('executeGetFieldValues', () => {
  test('formats values as markdown list', async () => {
    const fetchFn = mockFetch({
      'datasets/ds1/values/status': () => ['active', 'inactive', 'pending']
    })

    const result = await executeGetFieldValues({ datasetId: 'ds1', fieldKey: 'status' }, fetchFn)
    assert.ok(result.includes('Distinct values of `status`:'))
    assert.ok(result.includes('- active'))
    assert.ok(result.includes('- inactive'))
    assert.ok(result.includes('- pending'))
  })

  test('clamps size to 1000 max', async () => {
    let capturedQuery: any
    const fetchFn = mockFetch({
      'datasets/ds1/values/col': (_url: string, opts: any) => {
        capturedQuery = opts.query
        return []
      }
    })

    await executeGetFieldValues({ datasetId: 'ds1', fieldKey: 'col', size: 5000 }, fetchFn)
    assert.equal(capturedQuery.size, '1000')
  })

  test('clamps size to 1 min', async () => {
    let capturedQuery: any
    const fetchFn = mockFetch({
      'datasets/ds1/values/col': (_url: string, opts: any) => {
        capturedQuery = opts.query
        return []
      }
    })

    await executeGetFieldValues({ datasetId: 'ds1', fieldKey: 'col', size: -10 }, fetchFn)
    assert.equal(capturedQuery.size, '1')
  })
})
