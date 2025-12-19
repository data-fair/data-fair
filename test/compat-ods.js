import { strict as assert } from 'node:assert'
import * as testUtils from './resources/test-utils.js'
import * as whereParser from '../api/src/api-compat/ods/where.peg.js'
import * as selectParser from '../api/src/api-compat/ods/select.peg.js'
import * as orderByParser from '../api/src/api-compat/ods/order-by.peg.js'
import * as groupByParser from '../api/src/api-compat/ods/group-by.peg.js'
import * as aliasesParser from '../api/src/api-compat/ods/aliases.peg.js'
import * as workers from '../api/src/workers/index.ts'
import parquetjs from '@dsnp/parquetjs'
import Excel from 'exceljs'
import dayjs from 'dayjs'

describe.only('compatibility layer for ods api', function () {
  it('contains a parser to extract aliases from expressions', function () {
    assert.deepEqual(aliasesParser.parse('test'), {})
    assert.deepEqual(aliasesParser.parse('test as al'), { al: 'test' })
    assert.deepEqual(aliasesParser.parse('now() AS al'), { al: 'now()' })
    assert.deepEqual(aliasesParser.parse('avg(test, "test") AS al'), { al: 'avg(test, "test")' })
    assert.deepEqual(aliasesParser.parse('range(some_date, 1 day) as day'), { day: 'range(some_date, 1 day)' })
    assert.deepEqual(aliasesParser.parse('range(some_date, *, date\'2017-10-10\', date\'2017-11-11\', *) as day'), { day: 'range(some_date, *, date\'2017-10-10\', date\'2017-11-11\', *)' })
  })

  it('contains a parser for the where syntax', function () {
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

  it('contains a parser for the select syntax', function () {
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

  it('contains a parser for the order-by syntax', function () {
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

  it('contains a parser for the group-by syntax', function () {
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

  it('exposes records and exports api on 2 urls', async function () {
    const ax = global.ax.dmeadusOrg

    await ax.put('/api/v1/settings/organization/KWqAGZ4mG', { compatODS: true })

    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)

    let res = await ax.get(`/api/v1/compat-ods/v2.1/catalog/datasets/${dataset.id}/records`)
    assert.equal(res.status, 200)
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.total_count, 2)

    res = await ax.get(`/api/v1/compat-ods/v2.0/catalog/datasets/${dataset.id}/records`)
    assert.equal(res.status, 200)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`)
    assert.equal(res.status, 200)
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.total_count, 2)

    // simple select
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { select: '*' } })
    assert.equal(Object.keys(res.data.results[0]).length, 6)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { select: 'id,nb,adr' } })
    assert.equal(Object.keys(res.data.results[0]).length, 3)

    // select with aliases
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { select: 'id,nb as number' } })
    assert.equal(res.data.total_count, 2)
    assert.deepEqual(res.data.results[0], { id: 'koumoul', number: 11 })

    // select with aggregation
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { select: 'count(*)' } })
    assert.equal(res.data.total_count, 2)
    assert.deepEqual(res.data.results[0], { 'count(*)': 2 })

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { select: 'count(*) as total' } })
    assert.deepEqual(res.data.results[0], { total: 2 })

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { select: 'id,avg(nb) AS avg_nb,count(*) as total' } })
    assert.deepEqual(res.data.results[0], { id: 'koumoul', avg_nb: 16.6, total: 2 })

    // select with transforms
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, {
      params: { select: 'id,some_date as date,year(some_date) AS annee,month(some_date) as mois,day(some_date) as jour,hour(some_date) as heure,minute(some_date) as minute,second(some_date) as seconde' }
    })
    assert.deepEqual(res.data.results[0], {
      id: 'koumoul',
      date: '2017-12-12',
      annee: 2017,
      jour: 12,
      mois: 12,
      heure: 0,
      minute: 0,
      seconde: 0,
    })

    // simple filters
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { where: 'id: "koumoul"' } })
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.total_count, 1)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { where: 'id = "koumoul"' } })
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.total_count, 1)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { where: 'id is null' } })
    assert.equal(res.data.results.length, 0)
    assert.equal(res.data.total_count, 0)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { where: 'id is not null' } })
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.total_count, 2)

    assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { where: 'id: koumoul' } }), { status: 400 })

    // date filters
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { where: 'year(some_date) = 2017' } })
    assert.equal(res.data.results.length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { where: 'year(some_date) = 2018' } })
    assert.equal(res.data.results.length, 0)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { where: 'year(some_date) < 2018' } })
    assert.equal(res.data.results.length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { where: 'year(some_date) < 2017' } })
    assert.equal(res.data.results.length, 0)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { where: 'year(some_date) < 2017' } })
    assert.equal(res.data.results.length, 0)

    // facet filtering
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { refine: 'id:koumoul' } })
    assert.equal(res.data.total_count, 1)

    // sorting
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { order_by: 'id,nb' } })
    assert.equal(res.data.results[0].id, 'bidule')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { order_by: 'id DESC,nb' } })
    assert.equal(res.data.results[0].id, 'koumoul')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { order_by: '-id,nb' } })
    assert.equal(res.data.results[0].id, 'koumoul')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { order_by: 'random(1)' } })
    const resRand2 = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { order_by: 'random(1) desc' } })
    assert.equal(res.data.results[0].id, resRand2.data.results[1].id)
    assert.equal(res.data.results[1].id, resRand2.data.results[0].id)

    // simple group by
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id' } })
    assert.equal(res.data.total_count, 2)
    assert.deepEqual(res.data.results, [{ id: 'bidule' }, { id: 'koumoul' }])

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id,nb' } })
    assert.deepEqual(res.data.results, [{ id: 'bidule', nb: 22.2 }, { id: 'koumoul', nb: 11 }])

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id,nb', offset: 1 } })
    assert.deepEqual(res.data.results, [{ id: 'koumoul', nb: 11 }])

    // group by with metrics
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id,nb', select: 'count(*) as count' } })
    assert.deepEqual(res.data.results, [{ id: 'bidule', nb: 22.2, count: 1 }, { id: 'koumoul', nb: 11, count: 1 }])

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id', select: 'median(nb) as med' } })
    assert.deepEqual(res.data.results, [{ id: 'bidule', med: 22.2 }, { id: 'koumoul', med: 11 }])

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id', select: 'sum(nb) as sum' } })
    assert.deepEqual(res.data.results, [{ id: 'bidule', sum: 22.2 }, { id: 'koumoul', sum: 11 }])

    // group by with sorting
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id', order_by: 'avg(nb)' } })
    assert.equal(res.data.total_count, 2)
    assert.deepEqual(res.data.results, [{ id: 'koumoul' }, { id: 'bidule' }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id', order_by: 'id desc' } })
    assert.equal(res.data.total_count, 2)
    assert.deepEqual(res.data.results, [{ id: 'koumoul' }, { id: 'bidule' }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id as identifiant', order_by: 'identifiant desc' } })
    assert.equal(res.data.total_count, 2)
    assert.deepEqual(res.data.results, [{ identifiant: 'koumoul' }, { identifiant: 'bidule' }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id', order_by: 'avg(nb)', limit: 1 } })
    assert.equal(res.data.total_count, 2)
    assert.deepEqual(res.data.results, [{ id: 'koumoul' }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id', order_by: 'avg(nb)', limit: 1, offset: 1 } })
    assert.equal(res.data.total_count, 2)
    assert.deepEqual(res.data.results, [{ id: 'bidule' }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id', order_by: 'sum(nb)' } })
    assert.equal(res.data.total_count, 2)
    assert.deepEqual(res.data.results, [{ id: 'koumoul' }, { id: 'bidule' }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id', order_by: 'sum(nb) desc' } })
    assert.equal(res.data.total_count, 2)
    assert.deepEqual(res.data.results, [{ id: 'bidule' }, { id: 'koumoul' }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id', order_by: 'avg(nb) DESC' } })
    assert.deepEqual(res.data.results, [{ id: 'bidule' }, { id: 'koumoul' }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id', select: 'avg(nb) as avg_nb', order_by: 'avg_nb DESC' } })
    assert.deepEqual(res.data.results, [{ id: 'bidule', avg_nb: 22.2 }, { id: 'koumoul', avg_nb: 11 }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id', order_by: 'count(*) DESC' } })
    assert.deepEqual(res.data.results, [{ id: 'bidule' }, { id: 'koumoul' }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id', order_by: 'count(id) DESC' } })
    assert.deepEqual(res.data.results, [{ id: 'bidule' }, { id: 'koumoul' }])

    // group by number interval
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'range(nb, 10)', select: 'count(*)' } })
    assert.deepEqual(res.data.results, [
      { 'range(nb, 10)': '[10, 20[', 'count(*)': 1 },
      { 'range(nb, 10)': '[20, 30[', 'count(*)': 1 }
    ])

    // group by number ranges
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'range(nb, *, 20, *)', select: 'count(*)' } })
    assert.deepEqual(res.data.results, [
      { 'range(nb, *, 20, *)': '[*, 20.0[', 'count(*)': 1 },
      { 'range(nb, *, 20, *)': '[20.0, *[', 'count(*)': 1 }
    ])

    // group by date interval
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'range(some_date, 1 day) as day', select: 'count(*)' } })
    assert.deepEqual(res.data.results, [
      { day: '[2017-10-10T00:00:00.000Z, 2017-10-11T00:00:00.000Z[', 'count(*)': 1 },
      { day: '[2017-12-12T00:00:00.000Z, 2017-12-13T00:00:00.000Z[', 'count(*)': 1 }
    ])
    // same with timezone
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'range(some_date, 1 day) as day', select: 'count(*)', timezone: 'Europe/Paris' } })
    assert.deepEqual(res.data.results, [
      { day: '[2017-10-10T00:00:00+02:00, 2017-10-11T00:00:00+02:00[', 'count(*)': 1 },
      { day: '[2017-12-12T00:00:00+01:00, 2017-12-13T00:00:00+01:00[', 'count(*)': 1 }
    ])

    // group by year function
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'year(some_date) as annee', select: 'count(*)' } })
    assert.deepEqual(res.data.results, [
      { annee: 2017, 'count(*)': 2 }
    ])

    // group by date ranges
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'range(some_date, *, date\'2017-10-10\', date\'2017-11-11\', *) as day', select: 'count(*)' } })
    assert.deepEqual(res.data.results, [
      { day: '[*, 2017-10-10T00:00:00.000Z[', 'count(*)': 0 },
      { day: '[2017-10-10T00:00:00.000Z, 2017-11-11T00:00:00.000Z[', 'count(*)': 1 },
      { day: '[2017-11-11T00:00:00.000Z, *[', 'count(*)': 1 }
    ])
    // same with timezone
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'range(some_date, *, date\'2017-10-10\', date\'2017-11-11\', *) as day', select: 'count(*)', timezone: 'Europe/Paris' } })
    assert.deepEqual(res.data.results, [
      { day: '[*, 2017-10-09T22:00:00.000Z[', 'count(*)': 0 },
      { day: '[2017-10-09T22:00:00.000Z, 2017-11-10T23:00:00.000Z[', 'count(*)': 1 },
      { day: '[2017-11-10T23:00:00.000Z, *[', 'count(*)': 1 }
    ])

    // csv export
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/exports/csv`)
    assert.equal(res.data, `id;adr;some_date;loc;bool;nb
koumoul;19 rue de la voie lactée saint avé;2017-12-12;47.687375,-2.748526;0;11
bidule;adresse inconnue;2017-10-10;45.5,2.6;1;22.2
`)
    assert.equal(res.headers['content-type'], 'text/csv; charset=utf-8')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?sort=-id`)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/exports/csv`, { params: { group_by: 'id', select: 'id,count(*) as Count,avg(nb) as Avg', order_by: 'id desc' } })
    assert.equal(res.data, `id;Count;Avg
koumoul;1;11
bidule;1;22.2
`)

    // xlsx export
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/exports/xlsx`, { responseType: 'arraybuffer' })
    assert.equal(res.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    assert.equal(res.status, 200)
    assert.equal(typeof res.data, 'object')
    const workbook = new Excel.Workbook()
    await workbook.xlsx.load(res.data)
    const worksheet = workbook.getWorksheet(1)
    const json = worksheet?.getSheetValues()
    // @ts-ignore
    assert.equal(json.pop().pop(), 22.2)

    // parquet export
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/exports/parquet`, { responseType: 'arraybuffer' })
    assert.equal(res.headers['content-type'], 'application/vnd.apache.parquet')
    assert.equal(typeof res.data, 'object')
    const reader = await parquetjs.ParquetReader.openBuffer(res.data)
    const cursor = reader.getCursor()
    let record = null
    let i = 0
    while ((record = await cursor.next())) {
      if (i === 0) {
        assert.deepEqual(record, {
          id: 'koumoul',
          adr: '19 rue de la voie lactée saint avé',
          some_date: new Date('2017-12-12T00:00:00.000Z'),
          loc: '47.687375,-2.748526',
          bool: false,
          nb: 11
        })
      }
      i++
    }

    // json export
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/exports/json`)
    assert.equal(res.headers['content-type'], 'application/json; charset=utf-8')
    assert.equal(res.data.length, 2)
    assert.equal(res.data[0].id, 'koumoul')

    // jsonl export
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/exports/jsonl`)
    assert.equal(res.headers['content-type'], 'application/jsonl; charset=utf-8')
    const data = res.data.split('\n').filter(Boolean).map(JSON.parse)
    assert.equal(data.length, 2)
    assert.equal(data[0].id, 'koumoul')

    // geojson export
    const locProp = dataset.schema.find(p => p.key === 'loc')
    locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    await workers.hook('finalize/' + dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/exports/geojson`)
    assert.equal(res.headers['content-type'], 'application/geo+json')
    assert.equal(res.data.type, 'FeatureCollection')
    assert.equal(res.data.features.length, 2)
    assert.equal(res.data.features[0].properties.id, 'koumoul')
    assert.deepEqual(res.data.features[0].geometry, { type: 'Point', coordinates: [-2.748526, 47.687375] })
  })

  it('should manage some other record list cases', async function () {
    const ax = global.ax.dmeadusOrg

    await ax.put('/api/v1/settings/organization/KWqAGZ4mG', { compatODS: true })

    const dataset = await testUtils.sendDataset('datasets/dataset2.csv', ax)

    let res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`)
    assert.equal(res.status, 200)
    assert.equal(res.data.results.length, 6)
    assert.equal(res.data.total_count, 6)
    // missing values are "null"
    assert.equal(res.data.results[5].somedate, null)

    // group by considers "null" as the lower value
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?group_by=somedate`)
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.results[0].somedate, null)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?group_by=somedate&order_by=somedate desc`)
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.results[2].somedate, null)
  })

  it('should manage date times', async function () {
    const ax = global.ax.dmeadusOrg
    await ax.put('/api/v1/settings/organization/KWqAGZ4mG', { compatODS: true })

    const dataset = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest1',
      schema: [{ key: 'date1', type: 'string', format: 'date-time' }]
    }).then(r => r.data)
    await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { date1: '2025-09-11T06:00:00Z' })
    await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { date1: '2025-09-10T08:00:00Z' })

    let res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`)
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.results[0].date1, '2025-09-10T08:00:00+00:00')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?timezone=Europe/Paris`)
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.results[0].date1, '2025-09-10T10:00:00+02:00')

    // tolerant date filters
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?timezone=Europe/Paris`, { params: { where: 'date1 > \'2025-09-10T09:00:00+00:00\'' } })
    assert.equal(res.data.results.length, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?timezone=Europe/Paris`, { params: { where: 'date1 > \'2025-09-10 09:00:00\'' } })
    assert.equal(res.data.results.length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?timezone=Europe/Paris`, { params: { where: 'date1 > \'2025-09-10 11:00:00\'' } })
    assert.equal(res.data.results.length, 1)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?timezone=Europe/Paris`, { params: { where: "date1 >= date'2025-09-10 00:00' and date1 <= date'2025-09-10 23:59'" } })
    assert.equal(res.data.results.length, 1)
    assert.ok(res.headers['last-modified'])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?timezone=Europe/Paris`, { params: { where: 'date1 >= now()' } })
    assert.equal(res.data.results.length, 0)
    assert.ok(!res.headers['last-modified']) // now() filter must not be cached based on dataset finalizedAt property
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?timezone=Europe/Paris`, { params: { where: 'date1 <= now()' } })
    assert.equal(res.data.results.length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?timezone=Europe/Paris`, { params: { where: 'date1 >= now(year=-20)' } })
    assert.equal(res.data.results.length, 2)

    // date formatting
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?select=date_format(date1, 'yyyy/MM/dd') as date`)
    assert.equal(res.data.results[0].date, '2025/09/10')

    // group by formatted date
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?group_by=date_format(date1, 'yyyy/MM/dd')`)
    assert.deepEqual(res.data.results, [{ "date_format(date1, 'yyyy/MM/dd')": '2025/09/10' }, { "date_format(date1, 'yyyy/MM/dd')": '2025/09/11' }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?group_by=date_format(date1, 'yyyy/MM/dd') as date`)
    assert.deepEqual(res.data.results, [{ date: '2025/09/10' }, { date: '2025/09/11' }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?group_by=date_format(date1, 'yyyy/MM') as date&select=count(*)`)
    assert.deepEqual(res.data.results, [{ date: '2025/09', 'count(*)': 2 }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?group_by=date_format(date1, 'MMM yyyy') as date&select=count(*)`)
    assert.deepEqual(res.data.results, [{ date: 'Sep 2025', 'count(*)': 2 }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?group_by=date_format(date1, 'yyyy/MM/dd') as date&order_by=date`)
    assert.deepEqual(res.data.results, [{ date: '2025/09/10' }, { date: '2025/09/11' }])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?group_by=date_format(date1, 'yyyy/MM/dd') as date&order_by=date desc`)
    assert.deepEqual(res.data.results, [{ date: '2025/09/11' }, { date: '2025/09/10' }])

    // refine a date facet
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?timezone=Europe/Paris&refine=date1:2025/09/11`)
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.results[0].date1, '2025-09-11T08:00:00+02:00')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?timezone=Europe/Paris&refine=date1:2025/09`)
    assert.equal(res.data.results.length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?timezone=Europe/Paris&refine=date1:2025`)
    assert.equal(res.data.results.length, 2)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?timezone=Europe/Paris&refine=date1:2026`)
    assert.equal(res.data.results.length, 0)
  })

  it('should manage corner cases of parquet export', async function () {
    const ax = global.ax.dmeadusOrg
    await ax.put('/api/v1/settings/organization/KWqAGZ4mG', { compatODS: true })

    const dataset = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest-parquet',
      schema: [
        { key: 'date-time1', type: 'string', format: 'date-time', 'x-required': true },
        { key: 'date1', type: 'string', format: 'date', 'x-required': true },
        { key: 'str1', type: 'string', 'x-required': true },
        { key: 'str2', type: 'string' },
        { key: 'int1', type: 'integer', 'x-required': true },
        { key: 'nb1', type: 'number' },
      ]
    }).then(r => r.data)
    await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [
      { 'date-time1': '2025-09-10T08:00:00.000Z', date1: '2025-09-10', str1: 'String 1', str2: 'String 2', int1: 11, nb1: 1.1 },
      { 'date-time1': '2025-09-11T08:00:00.000Z', date1: '2025-09-11', str1: 'String 1 - 2', int1: 22 },
      { 'date-time1': '2025-09-12T08:00:00.000Z', date1: '2025-09-12', str1: 'String 1 - 3', str2: 'String 2 - 3', int1: 33, nb1: 3.3 },
    ])
    await workers.hook('finalize/' + dataset.id)

    const res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/exports/parquet?order_by=int1`, { responseType: 'arraybuffer' })
    assert.equal(typeof res.data, 'object')
    const reader = await parquetjs.ParquetReader.openBuffer(res.data)
    const parquetSchema = reader.getSchema()
    assert.equal(parquetSchema.schema['date-time1'].type, 'TIMESTAMP_MILLIS')
    assert.equal(parquetSchema.schema.date1.type, 'DATE')
    assert.equal(parquetSchema.schema.str1.type, 'UTF8')
    assert.equal(parquetSchema.schema.str1.optional, false)
    assert.equal(parquetSchema.schema.str2.type, 'UTF8')
    assert.equal(parquetSchema.schema.str2.optional, true)
    assert.equal(parquetSchema.schema.nb1.type, 'DOUBLE')
    assert.equal(parquetSchema.schema.int1.type, 'INT32')
    const cursor = reader.getCursor()
    let record = null
    let i = 0
    while ((record = await cursor.next())) {
      if (i === 0) {
        assert.deepEqual(record, { 'date-time1': new Date('2025-09-10T08:00:00.000Z'), date1: new Date('2025-09-10'), str1: 'String 1', str2: 'String 2', int1: 11, nb1: 1.1 })
      }
      if (i === 1) {
        assert.deepEqual(record, { 'date-time1': new Date('2025-09-11T08:00:00.000Z'), date1: new Date('2025-09-11'), str1: 'String 1 - 2', int1: 22, nb1: null, str2: null })
      }
      i++
    }
  })

  it('manage case-sensitive sort', async function () {
    const ax = global.ax.dmeadusOrg
    await ax.put('/api/v1/settings/organization/KWqAGZ4mG', { compatODS: true })

    let res = await ax.post('/api/v1/datasets/rest-insensitive', {
      isRest: true,
      title: 'rest-insensitive',
      schema: [{ key: 'str1', type: 'string' }]
    })
    res = await ax.post('/api/v1/datasets/rest-insensitive/_bulk_lines', [
      { str1: 'test3' },
      { str1: 'test2' },
      { str1: 'test1' },
      { str1: 'Test2' }
    ])
    await workers.hook('finalize/rest-insensitive')
    res = await ax.get('/api/v1/datasets/rest-insensitive/lines', { params: { sort: 'str1' } })
    assert.deepEqual(res.data.results.map(result => result.str1), ['test1', 'Test2', 'test2', 'test3'])
    res = await ax.get('/api/v1/datasets/rest-insensitive/compat-ods/records', { params: { order_by: 'str1' } })
    assert.deepEqual(res.data.results.map(result => result.str1), ['test1', 'Test2', 'test2', 'test3'])

    await ax.patch('/api/v1/datasets/rest-insensitive', { schema: [{ key: 'str1', type: 'string', 'x-capabilities': { insensitive: false } }] })
    await workers.hook('finalize/rest-insensitive')
    res = await ax.get('/api/v1/datasets/rest-insensitive/lines', { params: { sort: 'str1' } })
    assert.deepEqual(res.data.results.map(result => result.str1), ['Test2', 'test1', 'test2', 'test3'])
    res = await ax.get('/api/v1/datasets/rest-insensitive/compat-ods/records', { params: { order_by: 'str1' } })
    assert.deepEqual(res.data.results.map(result => result.str1), ['Test2', 'test1', 'test2', 'test3'])
  })

  it.skip('manages geo data', async function () {
    const ax = global.ax.dmeadusOrg

    await ax.put('/api/v1/settings/organization/KWqAGZ4mG', { compatODS: true })

    const dataset = await testUtils.sendDataset('geo/geojson-example.geojson', ax)

    const res = await ax.get(`/api/v1/compat-ods/v2.1/catalog/datasets/${dataset.id}/records`)
    assert.equal(res.status, 200)
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.total_count, 3)
  })
})
