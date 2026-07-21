import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import {
  prepareEsQuery,
  completeSort,
  prepareResult,
  isoWithOffset,
  transforms,
  applyAliases,
  sortBuckets,
  prepareBucketResult,
  parseFilters
} from '../../../../api/src/api-compat/ods/operations.ts'

dayjs.extend(utc)
dayjs.extend(timezone)

// pinning tests for the pure ODS → ES query translation + result shaping extracted from
// api-compat/ods/index.ts (Phase 7). The PEG parsers themselves are covered in compat-ods.unit.spec.ts.

test.describe('prepareEsQuery', () => {
  const ds = (extra: any = {}) => ({ id: 'ds1', schema: [{ key: 'a' }, { key: 'b' }, { key: '_i' }], ...extra })

  test('defaults: size 10, from 0, non-underscore source, _i tie-break, track_total_hits', () => {
    const r = prepareEsQuery(ds(), {}, 'records')
    assert.equal(r.grouped, false)
    assert.equal(r.size, 10)
    assert.equal(r.from, 0)
    assert.deepEqual(r.esQuery._source, ['a', 'b'])
    assert.deepEqual(r.esQuery.sort, ['_i'])
    assert.equal(r.esQuery.track_total_hits, true)
  })

  test('limit -1 is interpreted as 100; rows is an alias for limit; offset becomes from', () => {
    assert.equal(prepareEsQuery(ds(), { limit: '-1' }, 'records').size, 100)
    assert.equal(prepareEsQuery(ds(), { rows: '5' }, 'records').size, 5)
    assert.equal(prepareEsQuery(ds(), { offset: '20' }, 'records').from, 20)
  })

  test('select=* keeps all non-underscore fields as source', () => {
    const r = prepareEsQuery(ds(), { select: '*' }, 'records')
    assert.deepEqual(r.esQuery._source, ['a', 'b'])
  })

  test('an aggregation select produces esQuery.aggs', () => {
    const r = prepareEsQuery(ds({ schema: [{ key: 'a', type: 'number' }, { key: 'b' }, { key: '_i' }] }), { select: 'avg(a)' }, 'records')
    assert.deepEqual(r.esQuery.aggs, { 'avg(a)': { avg: { field: 'a' } } })
  })

  test('where filter is wired into the bool query and forces a _score tie-break', () => {
    const r = prepareEsQuery(ds(), { where: 'a:"x"' }, 'records')
    assert.equal(r.esQuery.query.bool.must.length, 1)
    assert.ok(r.esQuery.sort.includes('_score'))
  })

  test('group_by switches to a composite aggregation: size 0, no from/_source/sort', () => {
    const r = prepareEsQuery(ds(), { group_by: 'a' }, 'records')
    assert.equal(r.grouped, true)
    assert.equal(r.composite, true)
    assert.equal(r.esQuery.size, 0)
    assert.equal(r.esQuery.from, undefined)
    assert.equal(r.esQuery._source, undefined)
    assert.equal(r.esQuery.sort, undefined)
    assert.ok(r.esQuery.aggs.___group_by)
  })

  test('invalid where throws a 400 httpError', () => {
    assert.throws(() => prepareEsQuery(ds(), { where: 'a:::' }, 'records'), (err: any) => err.status === 400)
  })
})

test.describe('completeSort', () => {
  test('adds _score when a where filter is present', () => {
    const sort: any[] = []
    completeSort({ schema: [{ key: '_i' }] }, sort, { where: 'x' })
    assert.ok(sort.includes('_score'))
  })

  test('datasets with _updatedAt tie-break on _updatedAt then _i (desc)', () => {
    const sort: any[] = []
    completeSort({ schema: [{ key: '_updatedAt' }, { key: '_i' }] }, sort, {})
    assert.deepEqual(sort, [{ _updatedAt: 'desc' }, { _i: 'desc' }])
  })

  test('plain datasets tie-break on _i; virtual datasets additionally on _rand', () => {
    const plain: any[] = []
    completeSort({ schema: [{ key: '_i' }] }, plain, {})
    assert.deepEqual(plain, ['_i'])
    const virtual: any[] = []
    completeSort({ schema: [{ key: '_i' }], isVirtual: true }, virtual, {})
    assert.deepEqual(virtual, ['_i', '_rand'])
  })
})

test.describe('isoWithOffset', () => {
  test('utc / missing timezone returns a plain ISO string', () => {
    assert.equal(isoWithOffset('2020-01-02T03:04:05Z', undefined), '2020-01-02T03:04:05.000Z')
    assert.equal(isoWithOffset('2020-01-02T03:04:05Z', 'UTC'), '2020-01-02T03:04:05.000Z')
  })

  test('a non-utc timezone formats with the offset', () => {
    assert.equal(isoWithOffset('2020-01-02T03:04:05Z', 'Europe/Paris'), '2020-01-02T04:04:05+01:00')
  })

  test('honors DST (summer offset), negative, half-hour and 45-minute offsets', () => {
    assert.equal(isoWithOffset('2020-07-02T03:04:05Z', 'Europe/Paris'), '2020-07-02T05:04:05+02:00')
    assert.equal(isoWithOffset('2020-01-02T03:04:05Z', 'America/New_York'), '2020-01-01T22:04:05-05:00')
    assert.equal(isoWithOffset('2020-01-02T03:04:05Z', 'Asia/Kolkata'), '2020-01-02T08:34:05+05:30')
    assert.equal(isoWithOffset('2020-01-02T03:04:05Z', 'Pacific/Chatham'), '2020-01-02T16:49:05+13:45')
  })

  test('alwaysFormat=true emits an explicit +00:00 offset for UTC', () => {
    assert.equal(isoWithOffset('2020-01-02T03:04:05Z', 'UTC', true), '2020-01-02T03:04:05+00:00')
    assert.equal(isoWithOffset('2020-01-02T03:04:05Z', undefined, true), '2020-01-02T03:04:05+00:00')
  })
})

test.describe('transforms.date_part', () => {
  test('extracts calendar parts (month is 1-based)', () => {
    assert.equal(transforms.date_part('2021-03-15T10:20:30Z', 'UTC', 'year'), 2021)
    assert.equal(transforms.date_part('2021-03-15T10:20:30Z', 'UTC', 'month'), 3)
    assert.equal(transforms.date_part('2021-03-15T10:20:30Z', 'UTC', 'day'), 15)
  })

  test('respects a non-utc timezone (and crosses day boundaries)', () => {
    assert.equal(transforms.date_part('2021-03-15T10:20:30Z', 'Asia/Kolkata', 'hour'), 15)
    assert.equal(transforms.date_part('2021-03-15T10:20:30Z', 'Asia/Kolkata', 'minute'), 50)
    assert.equal(transforms.date_part('2020-07-02T23:34:05Z', 'Australia/Sydney', 'day'), 3)
    assert.equal(transforms.date_part('2020-07-02T23:34:05Z', 'Australia/Sydney', 'hour'), 9)
  })
})

test.describe('prepareResult', () => {
  test('formats date-time columns and merges top-level agg values', () => {
    const dataset = { schema: [{ key: 'd', type: 'string', format: 'date-time' }] }
    const result: any = { d: '2020-01-02T03:04:05Z' }
    prepareResult(dataset, result, { total: { value: 42 } }, 'UTC')
    assert.equal(result.d, '2020-01-02T03:04:05+00:00')
    assert.equal(result.total, 42)
  })

  test('ignores ___order_by_ aggregation keys', () => {
    const result: any = {}
    prepareResult({ schema: [] }, result, { ___order_by_x: { value: 9 } }, 'UTC')
    assert.equal('___order_by_x' in result, false)
  })
})

test.describe('applyAliases', () => {
  test('renames an aliased key and drops the source', () => {
    const result: any = { a: 1 }
    applyAliases(result, { a: [{ name: 'A' }] }, {})
    assert.equal(result.A, 1)
    assert.equal('a' in result, false)
  })

  test('numberInterval renders a bracket range', () => {
    const result: any = { a: 10 }
    applyAliases(result, { a: [{ name: 'a', numberInterval: 5 }] }, {})
    assert.equal(result.a, '[10, 15[')
  })

  test('select transforms are applied to surviving keys', () => {
    const result: any = { a: '2021-03-15T00:00:00Z' }
    applyAliases(result, { a: [{ name: 'a' }] }, { a: { type: 'date_part', param: 'year' } }, 'UTC')
    assert.equal(result.a, 2021)
  })
})

test.describe('sortBuckets', () => {
  test('returns buckets unchanged when sort is empty', () => {
    const buckets = [{ key: 'b' }, { key: 'a' }]
    assert.deepEqual(sortBuckets(buckets, []), buckets)
  })

  test('sorts by an aggregation value ascending / descending', () => {
    const buckets = () => [{ key: 'a', m: { value: 3 } }, { key: 'b', m: { value: 1 } }, { key: 'c', m: { value: 2 } }]
    assert.deepEqual(sortBuckets(buckets(), [{ m: 'asc' }]).map(b => b.key), ['b', 'c', 'a'])
    assert.deepEqual(sortBuckets(buckets(), [{ m: 'desc' }]).map(b => b.key), ['a', 'c', 'b'])
  })
})

test.describe('prepareBucketResult', () => {
  test('composite bucket spreads the key object; metric values are extracted', () => {
    const r = prepareBucketResult({}, { key: { a: 'x' }, m: { value: 7 } }, { m: {} }, true)
    assert.deepEqual(r, { a: 'x', m: 7 })
  })

  test('keyed bucket keeps the scalar key; date-range buckets render a bracket key', () => {
    assert.deepEqual(prepareBucketResult({}, { key: 'k', m: { value: 1 } }, { m: {} }, false), { key: 'k', m: 1 })
    const r = prepareBucketResult({}, { key: 0, from_as_string: '2020-01-01T00:00:00Z', to_as_string: '2021-01-01T00:00:00Z' }, {}, false)
    assert.equal(r.key, '[2020-01-01T00:00:00.000Z, 2021-01-01T00:00:00.000Z[')
  })
})

test.describe('transforms.date_transform', () => {
  // reference = the historical implementation (dayjs.tz per value) — the optimized version must be
  // byte-identical across timezones (incl. DST boundaries and half-hour offsets) and format tokens
  const referenceDateTransform = (dateStr: string, tz?: string, format?: string) => {
    const dayjsFormat = format?.replace(/yy/g, 'YY').replace(/d/g, 'D')
    return dayjs(dateStr).tz(tz ?? 'utc').format(dayjsFormat)
  }

  test('matches the historical dayjs.tz output', () => {
    const dates = [
      '2024-01-15T10:30:45.123Z', '2024-06-15T23:45:00Z',
      '2024-03-31T00:30:00Z', '2024-03-31T01:30:00Z', // Europe/Paris DST spring-forward
      '2024-10-27T00:30:00Z', '2024-11-03T05:30:00Z', // fall-back (Paris + New York)
      '1969-12-31T23:59:59Z'
    ]
    const timezones = [undefined, 'utc', 'UTC', 'Europe/Paris', 'America/New_York', 'Asia/Kolkata'] // Kolkata = +05:30
    const formats = [undefined, 'yyyy-MM-dd', 'dd/MM/yy HH:mm:ss', 'YYYY [d] HH', 'd MMM YYYY, Z']
    for (const d of dates) {
      for (const tz of timezones) {
        for (const f of formats) {
          assert.equal(transforms.date_transform(d, tz, f), referenceDateTransform(d, tz, f), `${d} ${tz} ${f}`)
        }
      }
    }
  })
})

test.describe('parseFilters virtual scoping', () => {
  const ds = (extra: any = {}) => ({ id: 'ds1', schema: [{ key: 'a' }, { key: 'b' }, { key: '_i' }], ...extra })

  test('nin virtual filters produce must_not clauses', () => {
    const { bool: { filter } } = parseFilters(ds({
      isVirtual: true,
      virtual: { children: ['c1'], filters: [{ key: 'a', operator: 'nin', values: ['x'] }] },
      // required since parseFilters now fails loudly on a virtual dataset missing this annotation
      // (mirrors the same guard in es/commons.ts#prepareQuery) — null means "nothing to scope"
      _descendantsFilters: null
    }), {}, 'records')
    assert.deepEqual(filter, [{ bool: { must_not: { term: { a: 'x' } } } }])
  })

  test('descendants filters produce a scoped _index clause', () => {
    const { bool: { filter } } = parseFilters(ds({
      isVirtual: true,
      virtual: { children: ['c1'] },
      _descendantsFilters: { indicesPrefix: 'dataset', unfilteredIds: ['c1'], filtered: [{ id: 'c2', filters: [{ key: 'a', values: ['x'] }] }] }
    }), {}, 'records')
    assert.equal(filter.length, 1)
    assert.deepEqual(filter[0].bool.should[1], { bool: { filter: [{ term: { _index: 'dataset-c2' } }, { term: { a: 'x' } }] } })
  })
})
