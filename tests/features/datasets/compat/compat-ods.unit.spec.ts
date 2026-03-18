import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import * as whereParser from '../../../../api/src/api-compat/ods/where.peg.js'
import * as selectParser from '../../../../api/src/api-compat/ods/select.peg.js'
import * as orderByParser from '../../../../api/src/api-compat/ods/order-by.peg.js'
import * as groupByParser from '../../../../api/src/api-compat/ods/group-by.peg.js'
import * as aliasesParser from '../../../../api/src/api-compat/ods/aliases.peg.js'
import * as refineParser from '../../../../api/src/api-compat/ods/refine.peg.js'
import dayjs from 'dayjs'

test.describe('ODS compatibility parsers unit tests', () => {
  test('contains a parser to extract aliases from expressions', () => {
    assert.deepEqual(aliasesParser.parse('test'), {})
    assert.deepEqual(aliasesParser.parse('test as al'), { al: 'test' })
    assert.deepEqual(aliasesParser.parse('now() AS al'), { al: 'now()' })
    assert.deepEqual(aliasesParser.parse('avg(test, "test") AS al'), { al: 'avg(test, "test")' })
    assert.deepEqual(aliasesParser.parse('range(some_date, 1 day) as day'), { day: 'range(some_date, 1 day)' })
    assert.deepEqual(aliasesParser.parse('range(some_date, *, date\'2017-10-10\', date\'2017-11-11\', *) as day'), { day: 'range(some_date, *, date\'2017-10-10\', date\'2017-11-11\', *)' })
  })

  test('contains a parser for the refine syntax', () => {
    assert.deepEqual(refineParser.parse('id:value', { dataset: { schema: [{ key: 'id' }] } }), [{ term: { id: 'value' } }])
    assert.deepEqual(refineParser.parse('id:"value"', { dataset: { schema: [{ key: 'id' }] } }), [{ term: { id: 'value' } }])
    assert.deepEqual(refineParser.parse('id:12345', { dataset: { schema: [{ key: 'id' }] } }), [{ term: { id: 12345 } }])
    assert.deepEqual(refineParser.parse('date:2025', { dataset: { schema: [{ key: 'date', type: 'string', format: 'date-time' }] } }), [{
      range: {
        date: {
          gte: '2025-01-01T00:00:00.000Z',
          lte: '2025-12-31T23:59:59.999Z'
        }
      }
    }])
    assert.deepEqual(refineParser.parse('date:2025', { dataset: { schema: [{ key: 'date', type: 'string', format: 'date-time' }] }, timezone: 'Europe/Paris' }), [{
      range: {
        date: {
          gte: '2024-12-31T23:00:00.000Z',
          lte: '2025-12-31T22:59:59.999Z'
        }
      }
    }])
    assert.deepEqual(refineParser.parse('date:"2025"', { dataset: { schema: [{ key: 'date', type: 'string', format: 'date-time' }] } }), [{
      range: {
        date: {
          gte: '2025-01-01T00:00:00.000Z',
          lte: '2025-12-31T23:59:59.999Z'
        }
      }
    }])
    assert.deepEqual(refineParser.parse('date:"2025/01/10"', { dataset: { schema: [{ key: 'date', type: 'string', format: 'date-time' }] } }), [{
      range: {
        date: {
          gte: '2025-01-10T00:00:00.000Z',
          lte: '2025-01-10T23:59:59.999Z'
        }
      }
    }])
    assert.deepEqual(refineParser.parse('date:"2025/1/10"', { dataset: { schema: [{ key: 'date', type: 'string', format: 'date-time' }] } }), [{
      range: {
        date: {
          gte: '2025-01-10T00:00:00.000Z',
          lte: '2025-01-10T23:59:59.999Z'
        }
      }
    }])
    assert.deepEqual(refineParser.parse('date:"2025/1"', { dataset: { schema: [{ key: 'date', type: 'string', format: 'date-time' }] } }), [{
      range: {
        date: {
          gte: '2025-01-01T00:00:00.000Z',
          lte: '2025-01-31T23:59:59.999Z'
        }
      }
    }])
    assert.deepEqual(refineParser.parse('id:test,date:"2025/1/10"', { dataset: { schema: [{ key: 'id' }, { key: 'date', type: 'string', format: 'date-time' }] } }), [{ term: { id: 'test' } }, {
      range: {
        date: {
          gte: '2025-01-10T00:00:00.000Z',
          lte: '2025-01-10T23:59:59.999Z'
        }
      }
    }])
  })

  test('contains a parser for the where syntax', () => {
    assert.deepEqual(
      whereParser.parse('"koumoul"', { searchFields: ['id'] }),
      {
        multi_match: {
          query: 'koumoul',
          fields: ['id'],
          operator: 'and',
          type: 'cross_fields'
        }
      }
    )

    assert.deepEqual(
      whereParser.parse('id:"koumoul"', { dataset: { schema: [{ key: 'id' }] } }),
      { term: { id: 'koumoul' } }
    )
    assert.deepEqual(
      whereParser.parse('`10`:"koumoul"', { dataset: { schema: [{ key: '10' }] } }),
      { term: { 10: 'koumoul' } }
    )
    assert.deepEqual(
      whereParser.parse('id:\'koumoul\'', { dataset: { schema: [{ key: 'id' }] } }),
      { term: { id: 'koumoul' } }
    )
    assert.deepEqual(
      whereParser.parse('id like \'koumo*\'', { dataset: { schema: [{ key: 'id' }] }, searchFields: ['id.text'], wildcardFields: ['id.wildcard'] }),
      { simple_query_string: { query: 'koumo*', fields: ['id', 'id.text', 'id.wildcard'] } }
    )
    assert.deepEqual(
      whereParser.parse('id: "koumoul"', { dataset: { schema: [{ key: 'id' }] } }),
      { term: { id: 'koumoul' } }
    )
    assert.deepEqual(
      whereParser.parse('id : "koumoul"', { dataset: { schema: [{ key: 'id' }] } }),
      { term: { id: 'koumoul' } }
    )
    assert.deepEqual(
      whereParser.parse('id = "koumoul"', { dataset: { schema: [{ key: 'id' }] } }),
      { term: { id: 'koumoul' } }
    )
    assert.deepEqual(
      whereParser.parse('nb > 12', { dataset: { schema: [{ key: 'nb' }] } }),
      { range: { nb: { gt: 12, time_zone: undefined } } }
    )
    assert.deepEqual(
      whereParser.parse('nb > 12 AND nb < 30', { dataset: { schema: [{ key: 'nb' }] } }),
      { bool: { must: [{ range: { nb: { gt: 12, time_zone: undefined } } }, { range: { nb: { lt: 30, time_zone: undefined } } }] } }
    )
    assert.deepEqual(
      whereParser.parse('nb > 12 OR id: "koumoul"', { dataset: { schema: [{ key: 'nb' }, { key: 'id' }] } }),
      { bool: { should: [{ range: { nb: { gt: 12, time_zone: undefined } } }, { term: { id: 'koumoul' } }] } }
    )
    assert.deepEqual(
      whereParser.parse('nb > 12 OR id: "koumoul" AND nb <= 12', { dataset: { schema: [{ key: 'nb' }, { key: 'id' }] } }),
      { bool: { should: [{ range: { nb: { gt: 12, time_zone: undefined } } }, { bool: { must: [{ term: { id: 'koumoul' } }, { range: { nb: { lte: 12, time_zone: undefined } } }] } }] } }
    )
    assert.deepEqual(
      whereParser.parse('(nb > 12 OR nb < 10) AND id = "koumoul"', { dataset: { schema: [{ key: 'nb' }, { key: 'id' }] } }),
      {
        bool: {
          must: [
            { bool: { should: [{ range: { nb: { gt: 12, time_zone: undefined } } }, { range: { nb: { lt: 10, time_zone: undefined } } }] } },
            { term: { id: 'koumoul' } }
          ]
        }
      }
    )
    assert.deepEqual(
      whereParser.parse('NOT id = "koumoul"', { dataset: { schema: [{ key: 'id' }] } }),
      { bool: { must_not: [{ term: { id: 'koumoul' } }] } }
    )

    assert.deepEqual(
      whereParser.parse('id in ("koumoul", "test1", "test2")', { dataset: { schema: [{ key: 'id' }] } }),
      { terms: { id: ['koumoul', 'test1', 'test2'] } }
    )

    assert.deepEqual(
      whereParser.parse('nb IN [1 TO 10]', { dataset: { schema: [{ key: 'nb' }] } }),
      { range: { nb: { gte: 1, lte: 10, time_zone: undefined } } }
    )
    assert.deepEqual(
      whereParser.parse('nb IN [1..10]', { dataset: { schema: [{ key: 'nb' }] } }),
      { range: { nb: { gte: 1, lte: 10, time_zone: undefined } } }
    )
    assert.deepEqual(
      whereParser.parse('nb IN [1 TO 10]', { dataset: { schema: [{ key: 'nb' }] } }),
      { range: { nb: { gte: 1, lte: 10, time_zone: undefined } } }
    )
    assert.deepEqual(
      whereParser.parse('nb IN ]1..10[', { dataset: { schema: [{ key: 'nb' }] } }),
      { range: { nb: { gt: 1, lt: 10, time_zone: undefined } } }
    )

    assert.deepEqual(
      whereParser.parse('10 IN nb', { dataset: { schema: [{ key: 'nb' }] } }),
      { term: { nb: 10 } }
    )

    assert.deepEqual(
      whereParser.parse('date: date\'2020/12/01\'', { dataset: { schema: [{ key: 'date' }] } }),
      { term: { date: '2020-12-01' } }
    )
    const now = dayjs()
    const now1 = dayjs(whereParser.parse('date: now()', { dataset: { schema: [{ key: 'date' }] } }).term.date)
    assert.equal(now.date(), now1.date())
    assert.equal(now.month(), now1.month())
    assert.equal(now.year(), now1.year())
    const now2 = dayjs(whereParser.parse('date: now(year=2000)', { dataset: { schema: [{ key: 'date' }] } }).term.date)
    assert.equal(now2.year(), 2000)
    const now3 = dayjs(whereParser.parse('date: now(day=+1)', { dataset: { schema: [{ key: 'date' }] } }).term.date)
    assert.equal(now3.date(), now.add(1, 'day').date())
    const now4 = dayjs(whereParser.parse('date: now(day=-11)', { dataset: { schema: [{ key: 'date' }] } }).term.date)
    assert.equal(now4.date(), now.subtract(11, 'day').date())
    const now5 = dayjs(whereParser.parse('date: now(hours=-9)', { dataset: { schema: [{ key: 'date' }] } }).term.date)
    assert.equal(now5.date(), now.subtract(9, 'hour').date())

    assert.deepEqual(
      whereParser.parse('search(test1, "bok of secret")', { dataset: { schema: [{ key: 'str1' }] }, searchFields: ['test1.text', 'test2.text'] }),
      { multi_match: { fields: ['test1.text'], fuzziness: 'AUTO', query: 'bok of secret', type: 'bool_prefix' } }
    )

    assert.deepEqual(
      whereParser.parse('search(test1, test2, "bok of secret")', { dataset: { schema: [{ key: 'str1' }] }, searchFields: ['test1.text', 'test2.text', 'test3.text'] }),
      { multi_match: { fields: ['test1.text', 'test2.text'], fuzziness: 'AUTO', query: 'bok of secret', type: 'bool_prefix' } }
    )

    assert.deepEqual(
      whereParser.parse('search(*, "bok of secret")', { dataset: { schema: [{ key: 'str1' }] }, searchFields: ['test1.text', 'test2.text', 'test3.text'] }),
      { multi_match: { fields: ['test1.text', 'test2.text', 'test3.text'], fuzziness: 'AUTO', query: 'bok of secret', type: 'bool_prefix' } }
    )

    assert.deepEqual(
      whereParser.parse('suggest(test1, "bok of secret")', { dataset: { schema: [{ key: 'str1' }] }, searchFields: ['test1.text', 'test2.text'] }),
      { multi_match: { fields: ['test1.text'], query: 'bok of secret', type: 'phrase_prefix' } }
    )

    assert.deepEqual(
      whereParser.parse('startswith(test1, "star")', { dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] } }),
      { bool: { should: [{ prefix: { test1: 'star' } }] } }
    )

    assert.deepEqual(
      whereParser.parse('startswith(*, "star")', { dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] } }),
      { bool: { should: [{ prefix: { test1: 'star' } }, { prefix: { test2: 'star' } }] } }
    )

    assert.deepEqual(
      whereParser.parse(
        'within_distance(geo, geom\'{"geometry": {"type": "Point","coordinates": [10, 10.1]}}\', 10km)',
        { dataset: { schema: [{ key: 'test1' }, { key: 'test2' }], bbox: [] } }
      ),
      { geo_distance: { _geopoint: [10, 10.1], distance: '10km' } }
    )

    assert.deepEqual(
      whereParser.parse(
        'in_bbox(geo, -10.11, 11, 12, 13)',
        { dataset: { schema: [{ key: 'test1' }, { key: 'test2' }], bbox: [] } }
      ),
      {
        geo_shape: {
          _geopoint: {
            relation: 'intersects',
            shape: { coordinates: [[-10.11, 13], [12, 11]], type: 'envelope' }
          }
        }
      }
    )

    assert.deepEqual(
      whereParser.parse(
        'intersects(geo, geom\'{"geometry": {"type": "Point","coordinates": [10, 10.1]}}\')',
        { dataset: { schema: [{ key: 'test1' }, { key: 'test2' }], bbox: [] } }
      ),
      {
        geo_shape: {
          _geopoint: {
            relation: 'intersects',
            shape: { geometry: { type: 'Point', coordinates: [10, 10.1] } }
          }
        }
      }
    )

    assert.deepEqual(
      whereParser.parse(
        'test1 is null',
        { dataset: { schema: [{ key: 'test1' }] } }
      ),
      {
        bool: {
          must_not: [{ exists: { field: 'test1' } }]
        }
      }
    )

    assert.deepEqual(
      whereParser.parse(
        'test1 is not null',
        { dataset: { schema: [{ key: 'test1' }] } }
      ),
      { exists: { field: 'test1' } }
    )
  })

  test('contains a parser for the select syntax', () => {
    assert.deepEqual(
      selectParser.parse('test1', { dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] } }),
      { sources: ['test1'], aliases: {}, aggregations: {}, finalKeys: ['test1'], transforms: {} }
    )

    assert.throws(
      () => selectParser.parse('testko', { dataset: { schema: [{ key: 'test1' }] } }),
      { message: 'Impossible de sélectionner le champ testko, il n\'existe pas dans le jeu de données.' }
    )

    assert.deepEqual(
      selectParser.parse('test1, test2', { dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] } }),
      { sources: ['test1', 'test2'], aliases: {}, aggregations: {}, finalKeys: ['test1', 'test2'], transforms: {} }
    )

    assert.deepEqual(
      selectParser.parse('test1 as Test, test2', { dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] } }),
      { sources: ['test1', 'test2'], aliases: { test1: [{ name: 'Test' }] }, aggregations: {}, finalKeys: ['Test', 'test2'], transforms: {} }
    )

    assert.deepEqual(
      selectParser.parse('avg(test1), test2', { dataset: { schema: [{ key: 'test1', type: 'number' }, { key: 'test2' }] } }),
      { sources: ['test2'], aliases: {}, aggregations: { 'avg(test1)': { avg: { field: 'test1' } } }, finalKeys: ['avg(test1)', 'test2'], transforms: {} }
    )

    assert.deepEqual(
      selectParser.parse('avg(test1) as avg_test, test2', { dataset: { schema: [{ key: 'test1', type: 'number' }, { key: 'test2' }] } }),
      { sources: ['test2'], aliases: { 'avg(test1)': [{ name: 'avg_test' }] }, aggregations: { 'avg(test1)': { avg: { field: 'test1' } } }, finalKeys: ['avg_test', 'test2'], transforms: {} }
    )

    assert.deepEqual(
      selectParser.parse('year(test1) as annee, test2', { dataset: { schema: [{ key: 'test1', type: 'string', format: 'date-time' }, { key: 'test2' }] } }),
      {
        sources: ['test1', 'test2'],
        aliases: { test1: [{ name: 'annee' }] },
        aggregations: {},
        finalKeys: ['annee', 'test2'],
        transforms: { annee: { type: 'date_part', param: 'year', ignoreTimezone: false } }
      }
    )
  })

  test('contains a parser for the order-by syntax', () => {
    assert.deepEqual(
      orderByParser.parse('test1', { dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] }, simpleAliases: {} }),
      { sort: [{ test1: 'asc' }], aggregations: {} }
    )

    assert.throws(
      () => orderByParser.parse('testko', { dataset: { schema: [{ key: 'test1' }] }, simpleAliases: {} }),
      { message: 'Impossible de trier sur le champ testko, il n\'existe pas dans le jeu de données.' }
    )

    assert.deepEqual(
      orderByParser.parse('test1, test2 DESC', { dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] }, simpleAliases: {} }),
      { sort: [{ test1: 'asc' }, { test2: 'desc' }], aggregations: {} }
    )

    assert.deepEqual(
      orderByParser.parse('test1, avg_test2 DESC', {
        aliases: { 'avg(test2)': [{ name: 'avg_test2' }] },
        simpleAliases: { avg_test2: 'avg(test2)' },
        dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] }
      }),
      { sort: [{ test1: 'asc' }, { 'avg(test2)': 'desc' }], aggregations: {} }
    )

    assert.deepEqual(
      orderByParser.parse('avg(test1) DESC, test2', {
        dataset: { schema: [{ key: 'test1', type: 'number' }, { key: 'test2' }] },
        simpleAliases: {}
      }),
      {
        sort: [{ ___order_by_avg_test1: 'desc' }, { test2: 'asc' }],
        aggregations: { ___order_by_avg_test1: { avg: { field: 'test1' } } }
      }
    )

    assert.deepEqual(
      orderByParser.parse('test1, test2 DESC', {
        dataset: { schema: [{ key: 'test1' }, { key: 'test2', type: 'string', capabilities: { insensitive: true } }] },
        simpleAliases: {}
      }),
      { sort: [{ test1: 'asc' }, { 'test2.keyword_insensitive': 'desc' }], aggregations: {} }
    )
  })

  test('contains a parser for the group-by syntax', () => {
    assert.deepEqual(
      groupByParser.parse('test1', { sort: [], aggs: {}, dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] } }),
      {
        aliases: [{ name: 'test1' }],
        transforms: {},
        composite: true,
        agg: {
          composite: {
            size: 20000,
            sources: [{
              test1: {
                terms: { field: 'test1', order: 'asc', missing_bucket: true }
              }
            }]
          },
          aggs: {}
        }
      }
    )

    assert.throws(
      () => groupByParser.parse('testko', { sort: [], aggs: {}, dataset: { schema: [{ key: 'test1' }] } }),
      { message: 'Impossible de grouper par le champ testko, il n\'existe pas dans le jeu de données.' }
    )

    assert.deepEqual(
      groupByParser.parse('test1,test2', { sort: [], aggs: {}, dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] } }),
      {
        aliases: [{ name: 'test1' }, { name: 'test2' }],
        transforms: {},
        composite: true,
        agg: {
          composite: {
            size: 20000,
            sources: [{
              test1: { terms: { field: 'test1', order: 'asc', missing_bucket: true } }
            }, {
              test2: { terms: { field: 'test2', order: 'asc', missing_bucket: true } }
            }]
          },
          aggs: {}
        }
      }
    )

    assert.deepEqual(
      groupByParser.parse('test1 As Test1,test2', { sort: [], aggs: {}, dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] } }),
      {
        aliases: [{ name: 'Test1' }, { name: 'test2' }],
        transforms: {},
        composite: true,
        agg: {
          composite: {
            size: 20000,
            sources: [{
              test1: { terms: { field: 'test1', order: 'asc', missing_bucket: true } }
            }, {
              test2: { terms: { field: 'test2', order: 'asc', missing_bucket: true } }
            }]
          },
          aggs: {}
        }
      }
    )

    assert.deepEqual(
      groupByParser.parse('range(test1, 10)', { sort: [], aggs: {}, dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] } }),
      {
        aliases: [{ name: 'range(test1, 10)', numberInterval: 10 }],
        transforms: {},
        composite: true,
        agg: {
          composite: {
            size: 20000,
            sources: [{
              'range(test1, 10)': {
                histogram: { field: 'test1', interval: 10 }
              }
            }]
          },
          aggs: {}
        }
      }
    )

    assert.deepEqual(
      groupByParser.parse('range(test1, 1 days)', { sort: [], aggs: {}, dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] } }),
      {
        aliases: [{ name: 'range(test1, 1 days)', dateInterval: { value: 1, unit: 'd' } }],
        transforms: {},
        composite: true,
        agg: {
          composite: {
            size: 20000,
            sources: [{
              'range(test1, 1 days)': {
                date_histogram: { field: 'test1', calendar_interval: '1d', time_zone: undefined }
              }
            }]
          },
          aggs: {}
        }
      }
    )
    assert.deepEqual(
      groupByParser.parse('year(test1)', { sort: [], aggs: {}, dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] } }),
      {
        aliases: [{ name: 'year(test1)' }],
        transforms: {
          'year(test1)': {
            param: 'year',
            type: 'date_part'
          }
        },
        composite: true,
        agg: {
          composite: {
            size: 20000,
            sources: [{
              'year(test1)': {
                date_histogram: { field: 'test1', calendar_interval: '1y', time_zone: undefined }
              }
            }]
          },
          aggs: {}
        }
      }
    )

    assert.deepEqual(
      groupByParser.parse('range(test1, *, 10, *)', { sort: [], aggs: {}, dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] } }),
      {
        aliases: [{ name: 'range(test1, *, 10, *)', numberRanges: true }],
        composite: false,
        agg: {
          range: { field: 'test1', ranges: [{ to: 10 }, { from: 10 }] },
          aggs: {}
        }
      }
    )

    assert.deepEqual(
      groupByParser.parse('range(test1, *, date\'2020-11-13\', date\'2021-01-01\')', { sort: [], aggs: {}, dataset: { schema: [{ key: 'test1' }, { key: 'test2' }] }, timezone: 'UTC' }),
      {
        aliases: [{ name: 'range(test1, *, date\'2020-11-13\', date\'2021-01-01\')', dateRanges: true }],
        composite: false,
        agg: {
          date_range: {
            field: 'test1',
            time_zone: 'UTC',
            ranges: [{ to: '2020-11-13' }, { from: '2020-11-13', to: '2021-01-01' }]
          },
          aggs: {}
        }
      }
    )
  })
})
