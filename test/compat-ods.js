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
  })

  it('exposes records and exports api on 2 urls', async function () {
    const ax = global.ax.dmeadusOrg

    await ax.put('/api/v1/settings/organization/KWqAGZ4mG', { compatODS: true })

    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)

    let res = await ax.get(`/api/v1/compat-ods/v2.1/catalog/datasets/${dataset.id}/records`)
    assert.equal(res.status, 200)
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.total_count, 2)

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
    assert.equal(res.data, `"id","adr","some date","loc","bool","nb"
"koumoul","19 rue de la voie lactée saint avé","2017-12-12","47.687375,-2.748526",0,11
"bidule","adresse inconnue","2017-10-10","45.5,2.6",1,22.2
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
