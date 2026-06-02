import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { FILTER_CAPABILITIES, getColumnFilters, getColumnOperations } from '../../../../api/src/datasets/es/operations.ts'

const DEFAULT_FILTERS = ['_eq', '_neq', '_in', '_nin', '_lt', '_lte', '_gt', '_gte', '_starts', '_exists', '_nexists', '_search']

test.describe('FILTER_CAPABILITIES table', () => {
  test('keys are the canonical suffix set in docs order', () => {
    assert.deepEqual(Object.keys(FILTER_CAPABILITIES), [...DEFAULT_FILTERS.slice(0, 11), '_contains', '_search'])
  })
})

test.describe('getColumnFilters', () => {
  test('a default string column gets all index + search filters (no _contains)', () => {
    assert.deepEqual(getColumnFilters({ key: 'name', type: 'string' }), DEFAULT_FILTERS)
  })
  test('index:false drops all exact/range/exists filters but keeps _search', () => {
    assert.deepEqual(getColumnFilters({ key: 'bio', type: 'string', 'x-capabilities': { index: false } }), ['_search'])
  })
  test('wildcard:true adds _contains', () => {
    const filters = getColumnFilters({ key: 'code', type: 'string', 'x-capabilities': { wildcard: true } })
    assert.ok(filters.includes('_contains'))
    assert.equal(filters.indexOf('_contains'), 11) // canonical position
  })
  test('text:false + textStandard:false drops _search', () => {
    const filters = getColumnFilters({ key: 'code', type: 'string', 'x-capabilities': { text: false, textStandard: false } })
    assert.ok(!filters.includes('_search'))
  })
  test('_search survives if only one of text/textStandard is enabled (any-of)', () => {
    assert.ok(getColumnFilters({ key: 'x', type: 'string', 'x-capabilities': { text: false } }).includes('_search'))
    assert.ok(getColumnFilters({ key: 'x', type: 'string', 'x-capabilities': { textStandard: false } }).includes('_search'))
  })
})

test.describe('getColumnOperations', () => {
  test('default numeric column: sortable, groupable, metric, not wordAgg', () => {
    const ops = getColumnOperations({ key: 'age', type: 'integer' })
    assert.equal(ops.sortable, true)
    assert.equal(ops.groupable, true)
    assert.equal(ops.metric, true)
    assert.equal(ops.wordAgg, false)
  })
  test('values:false makes it not sortable/groupable/metric', () => {
    const ops = getColumnOperations({ key: 'bio', type: 'string', 'x-capabilities': { values: false } })
    assert.equal(ops.groupable, false)
    assert.equal(ops.metric, false)
  })
  test('insensitive keeps a values:false string sortable', () => {
    const ops = getColumnOperations({ key: 'name', type: 'string', 'x-capabilities': { values: false } })
    assert.equal(ops.sortable, true) // insensitive defaults true
  })
  test('textAgg:true enables wordAgg', () => {
    assert.equal(getColumnOperations({ key: 't', type: 'string', 'x-capabilities': { textAgg: true } }).wordAgg, true)
  })
  test('_geo* columns are not groupable', () => {
    assert.equal(getColumnOperations({ key: '_geopoint', type: 'string' }).groupable, false)
  })
})
