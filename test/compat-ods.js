import { strict as assert } from 'node:assert'
import * as testUtils from './resources/test-utils.js'
import * as whereParser from '../api/src/catalogs/plugins/ods/where.peg.js'

describe('compatibility layer for ods api', function () {
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
      whereParser.parse('id like \'koumo*\'', { dataset: { schema: [{ key: 'id' }] }, searchFields: ['id.text'], wildCardFields: ['id.wildcard'] }),
      { simple_query_string: { query: 'koumo*', fields: ['id.text', 'id.wildcard'] } }
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
      { range: { nb: { gt: 12 } } }
    )
    assert.deepEqual(
      whereParser.parse('nb > 12 AND nb < 30', { dataset: { schema: [{ key: 'nb' }] } }),
      { bool: { must: [{ range: { nb: { gt: 12 } } }, { range: { nb: { lt: 30 } } }] } }
    )
    assert.deepEqual(
      whereParser.parse('nb > 12 OR id: "koumoul"', { dataset: { schema: [{ key: 'nb' }, { key: 'id' }] } }),
      { bool: { should: [{ range: { nb: { gt: 12 } } }, { term: { id: 'koumoul' } }] } }
    )
    assert.deepEqual(
      whereParser.parse('nb > 12 OR id: "koumoul" AND nb <= 12', { dataset: { schema: [{ key: 'nb' }, { key: 'id' }] } }),
      { bool: { should: [{ range: { nb: { gt: 12 } } }, { bool: { must: [{ term: { id: 'koumoul' } }, { range: { nb: { lte: 12 } } }] } }] } }
    )
    assert.deepEqual(
      whereParser.parse('(nb > 12 OR nb < 10) AND id = "koumoul"', { dataset: { schema: [{ key: 'nb' }, { key: 'id' }] } }),
      {
        bool: {
          must: [
            { bool: { should: [{ range: { nb: { gt: 12 } } }, { range: { nb: { lt: 10 } } }] } },
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
      { range: { nb: { gte: 1, lte: 10 } } }
    )
    assert.deepEqual(
      whereParser.parse('nb IN [1..10]', { dataset: { schema: [{ key: 'nb' }] } }),
      { range: { nb: { gte: 1, lte: 10 } } }
    )
    assert.deepEqual(
      whereParser.parse('nb IN [1 TO 10]', { dataset: { schema: [{ key: 'nb' }] } }),
      { range: { nb: { gte: 1, lte: 10 } } }
    )
    assert.deepEqual(
      whereParser.parse('nb IN ]1..10[', { dataset: { schema: [{ key: 'nb' }] } }),
      { range: { nb: { gt: 1, lt: 10 } } }
    )

    assert.deepEqual(
      whereParser.parse('10 IN nb', { dataset: { schema: [{ key: 'nb' }] } }),
      { term: { nb: 10 } }
    )

    assert.deepEqual(
      whereParser.parse('date: date\'2020/12/01\'', { dataset: { schema: [{ key: 'date' }] } }),
      { term: { date: '2020-12-01' } }
    )
    assert.deepEqual(
      whereParser.parse('date: date\'2020-12-01\'', { dataset: { schema: [{ key: 'date' }] } }),
      { term: { date: '2020-12-01' } }
    )

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
        'in_bbox(geo, 10, 11, 12, 13)',
        { dataset: { schema: [{ key: 'test1' }, { key: 'test2' }], bbox: [] } }
      ),
      {
        geo_shape: {
          _geopoint: {
            relation: 'intersects',
            shape: { coordinates: [[10, 13], [12, 11]], type: 'envelope' }
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

    // simple filters
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { where: 'id: "koumoul"' } })
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.total_count, 1)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { where: 'id = "koumoul"' } })
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.total_count, 1)

    assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { where: 'id: koumoul' } }), { status: 400 })

    // sorting
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { order_by: 'id,nb' } })
    assert.equal(res.data.results[0].id, 'bidule')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { order_by: 'id DESC,nb' } })
    assert.equal(res.data.results[0].id, 'koumoul')

    // simple group by
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id' } })
    assert.deepEqual(res.data.results, [{ id: 'bidule' }, { id: 'koumoul' }])

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id,nb' } })
    assert.deepEqual(res.data.results, [{ id: 'bidule', nb: 22.2 }, { id: 'koumoul', nb: 11 }])

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`, { params: { group_by: 'id,nb', offset: 1 } })
    assert.deepEqual(res.data.results, [{ id: 'koumoul', nb: 11 }])

    // csv export
    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/exports/csv`)
    assert.equal(res.data, `id;adr;some date;loc;bool;nb
koumoul;19 rue de la voie lactée saint avé;2017-12-12;47.687375,-2.748526;0;11
bidule;adresse inconnue;2017-10-10;45.5,2.6;1;22.2
`)
  })

  it('should manage some other record list cases', async function () {
    const ax = global.ax.dmeadusOrg

    await ax.put('/api/v1/settings/organization/KWqAGZ4mG', { compatODS: true })

    const dataset = await testUtils.sendDataset('datasets/dataset2.csv', ax)

    const res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`)
    assert.equal(res.status, 200)
    assert.equal(res.data.results.length, 6)
    assert.equal(res.data.total_count, 6)
    // missing values are "null"
    assert.equal(res.data.results[5].somedate, null)
  })

  it('should manage date times', async function () {
    const ax = global.ax.dmeadusOrg

    await ax.put('/api/v1/settings/organization/KWqAGZ4mG', { compatODS: true })

    const dataset = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest1',
      schema: [{ key: 'date1', type: 'string', format: 'date-time' }]
    }).then(r => r.data)
    await ax.post(`/api/v1/datasets/${dataset.id}/lines`, { date1: '2025-09-10T08:00:00Z' })

    let res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records`)
    assert.equal(res.status, 200)
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.results[0].date1, '2025-09-10T08:00:00+00:00')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/compat-ods/records?timezone=Europe/Paris`)
    assert.equal(res.status, 200)
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.results[0].date1, '2025-09-10T10:00:00+02:00')
  })

  it.skip('manages geo data', async function () {
    const ax = global.ax.dmeadusOrg

    await ax.put('/api/v1/settings/organization/KWqAGZ4mG', { compatODS: true })

    const dataset = await testUtils.sendDataset('geo/geojson-example.geojson', ax)

    const res = await ax.get(`/api/v1/compat-ods/v2.1/catalog/datasets/${dataset.id}/records`)
    assert.equal(res.status, 200)
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.total_count, 3)
    console.log(res.data)
  })
})
